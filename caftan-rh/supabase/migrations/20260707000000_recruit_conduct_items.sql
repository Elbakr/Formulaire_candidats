-- Karim 2026-07-07 : RÉFÉRENTIEL éditable « conduite & erreurs de débutant » pour
-- les nouvelles recrues (magasins Caftan Factory). Catalogue admin CRUD curable
-- (ajout/modif/suppr/réordonnancement/activation). PAS d'envoi automatique : ce
-- contenu servira PLUS TARD à l'onboarding. Toutes les valeurs sont éditables.
create table if not exists public.recruit_conduct_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,                              -- thème (Pauses, Vente, ...)
  title text not null,                                 -- intitulé court de la règle/erreur
  description text,                                    -- explication / attendu / pourquoi
  phase text,                                          -- optionnel : Jour 1..4, Général
  severity text not null default 'important',          -- 'info' | 'important' | 'critique'
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_rci_category on public.recruit_conduct_items(category);
create index if not exists idx_rci_sort on public.recruit_conduct_items(category, sort_order);

alter table public.recruit_conduct_items enable row level security;
-- Lecture admin/rh/manager ; écriture via service-role (admin UI après requireRole).
drop policy if exists rci_read on public.recruit_conduct_items;
create policy rci_read on public.recruit_conduct_items for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin','rh','manager'));

-- ── SEED initial (uniquement si la table est vide → idempotent) ─────────────
do $$
begin
  if not exists (select 1 from public.recruit_conduct_items) then
    insert into public.recruit_conduct_items (category, title, description, phase, severity, sort_order) values
    -- Progression attendue (phases)
    ('Progression attendue', 'Jour 1 — Formation & observation', 'Découvrir le magasin, les produits et les procédures ; observer un collègue expérimenté ; poser des questions. La recrue ne doit pas être laissée seule.', 'Jour 1', 'info', 1),
    ('Progression attendue', 'Jour 2 — Première autonomie', 'Peut tenir un magasin seule si nécessaire : connaître l''ouverture/fermeture, la caisse de base et l''accueil client.', 'Jour 2', 'important', 2),
    ('Progression attendue', 'Jour 3 — Consolidation', 'Gagner en aisance à la vente sans relâcher la rigueur.', 'Jour 3', 'info', 3),
    ('Progression attendue', 'Jour 4+ — Rythme d''équipe', 'Intégrer pleinement les règles de service et de coordination de l''équipe.', 'Jour 4', 'info', 4),

    -- Ponctualité & présence
    ('Ponctualité & présence', 'Arriver en retard', 'Être présent(e) et prêt(e) à l''heure d''ouverture du shift, pas « à l''heure pile ».', 'Général', 'important', 1),
    ('Ponctualité & présence', 'Partir avant l''heure', 'Ne pas quitter son poste avant la fin du shift ou de la fermeture.', 'Général', 'important', 2),
    ('Ponctualité & présence', 'S''absenter du rayon sans prévenir le responsable', 'Toute absence du rayon (même courte) doit être signalée pour ne pas laisser la surface sans personne.', 'Général', 'important', 3),
    ('Ponctualité & présence', 'Quitter le magasin pendant le service', 'Ne jamais laisser le magasin sans surveillance pendant les heures d''ouverture.', 'Général', 'critique', 4),
    ('Ponctualité & présence', 'Ne pas prévenir en cas d''empêchement', 'En cas de retard ou d''absence, prévenir le responsable le plus tôt possible.', 'Général', 'important', 5),
    ('Ponctualité & présence', 'Ne pas respecter les horaires de shift affichés', 'Consulter et respecter le planning ; ne pas improviser ses horaires.', 'Général', 'important', 6),

    -- Pauses (une pause ne doit JAMAIS nuire au service, du début à la fin)
    ('Pauses', 'Pause commune entre 2 magasins laissant un magasin sans personne', 'RÈGLE : une pause ne doit JAMAIS laisser une équipe ou un magasin sans personne. Coordonner impérativement pour garder chaque point de vente couvert.', 'Général', 'critique', 1),
    ('Pauses', 'Prendre sa pause en heure de pointe / affluence', 'Décaler sa pause hors des pics de fréquentation pour rester disponible pour les clients.', 'Général', 'important', 2),
    ('Pauses', 'Pauses trop longues ou trop fréquentes', 'Respecter la durée et le nombre de pauses convenus.', 'Général', 'important', 3),
    ('Pauses', 'Ne pas coordonner sa pause avec l''équipe et le responsable', 'Toujours annoncer et faire valider sa pause pour assurer la continuité du service.', 'Général', 'important', 4),
    ('Pauses', 'Enchaîner pause + retard', 'Ne pas cumuler une pause avec un retour tardif : cela double l''absence du poste.', 'Général', 'important', 5),
    ('Pauses', 'Prolonger sa pause au-delà du temps convenu', 'Revenir à l''heure exacte de fin de pause, sans « déborder ».', 'Général', 'important', 6),

    -- Rester à son poste / déplacements injustifiés
    ('Rester à son poste', 'Traîner dans les autres magasins sans raison', 'Rester sur son point de vente ; ne pas se promener dans les autres magasins sans motif professionnel.', 'Général', 'important', 1),
    ('Rester à son poste', 'Aller « rendre visite » aux collègues d''un autre magasin', 'Les visites de courtoisie entre magasins pendant le service ne sont pas admises.', 'Général', 'important', 2),
    ('Rester à son poste', 'Rester ou revenir après le service pour la compagnie des collègues', 'Une fois hors service, quitter le magasin ; ne pas y rester pour socialiser.', 'Général', 'important', 3),
    ('Rester à son poste', 'Se déplacer d''un magasin à l''autre sans informer le responsable', 'Tout déplacement inter-magasins doit être connu et validé par le responsable.', 'Général', 'important', 4),
    ('Rester à son poste', 'Sortir fumer ou téléphoner en laissant le rayon', 'Ne pas laisser le rayon sans personne pour une cigarette ou un appel.', 'Général', 'important', 5),

    -- Relations avec les collègues (professionnalisme)
    ('Relations avec les collègues', 'Familiarité excessive avec les collègues', 'Garder une distance professionnelle : trop de proximité nuit au cadre de travail.', 'Général', 'important', 1),
    ('Relations avec les collègues', 'Chercher l''amitié au détriment du travail', 'Les priorités restent le client et le service, pas la vie sociale.', 'Général', 'important', 2),
    ('Relations avec les collègues', 'Regroupements et bavardages en rayon pendant le service', 'Éviter les attroupements entre collègues ; rester disponible et répartis en surface.', 'Général', 'important', 3),
    ('Relations avec les collègues', 'Parler des clients ou des collègues devant la clientèle', 'Aucun commentaire sur un client ou un collègue à portée d''oreille de la clientèle.', 'Général', 'important', 4),
    ('Relations avec les collègues', 'Prendre parti dans des conflits', 'Ne pas s''immiscer ni prendre parti dans les différends internes.', 'Général', 'important', 5),
    ('Relations avec les collègues', 'Commérages', 'Éviter les rumeurs et les ragots, sources de tensions et de démotivation.', 'Général', 'info', 6),

    -- Vente (PRIORITÉ N°1)
    ('Vente', 'Ne pas accueillir ni aborder le client', 'PRIORITÉ N°1 : accueillir, saluer et aller vers chaque client entré en magasin.', 'Général', 'critique', 1),
    ('Vente', 'Rester derrière la caisse ou sur son téléphone', 'Être en surface, disponible et actif ; la caisse n''est pas un poste de repli.', 'Général', 'important', 2),
    ('Vente', 'Ne pas conseiller ni proposer de vente additionnelle', 'Conseiller, proposer des tailles/pièces complémentaires et la vente additionnelle.', 'Général', 'important', 3),
    ('Vente', 'Laisser un client sans réponse ou en attente', 'Prendre en charge le client rapidement ; ne pas le laisser chercher seul ou patienter.', 'Général', 'important', 4),
    ('Vente', 'Méconnaître les produits, tailles et stock', 'Connaître la gamme, les tailles disponibles et le stock pour bien conseiller.', 'Général', 'important', 5),
    ('Vente', 'Ne pas orienter vers la retouche express quand c''est pertinent', 'Proposer la retouche express lorsqu''elle permet de conclure une vente.', 'Général', 'info', 6),

    -- Rayon, tailles & présentation (merchandising)
    ('Rayon & présentation', 'Rayons mal rangés', 'Maintenir les rayons ordonnés et attractifs en permanence.', 'Général', 'important', 1),
    ('Rayon & présentation', 'Variantes ou tailles manquantes en rayon alors qu''il y a du stock', 'Sortir les tailles/variantes disponibles en réserve pour compléter le rayon.', 'Général', 'important', 2),
    ('Rayon & présentation', 'Ne pas réassortir', 'Réassortir dès qu''un modèle se vide, sans attendre.', 'Général', 'important', 3),
    ('Rayon & présentation', 'Cintres mal orientés ou tailles mélangées', 'Cintres dans le bon sens, tailles classées : présentation soignée.', 'Général', 'info', 4),
    ('Rayon & présentation', 'Cabines laissées en désordre', 'Remettre en ordre les cabines après chaque passage client.', 'Général', 'important', 5),
    ('Rayon & présentation', 'Vitrine négligée', 'Vitrine propre, complète et à jour : première impression du magasin.', 'Général', 'info', 6),

    -- Propreté des lieux
    ('Propreté des lieux', 'Sol, vitrines, cabines ou caisse sales ou en désordre', 'Garder l''ensemble du magasin propre et rangé tout au long de la journée.', 'Général', 'important', 1),
    ('Propreté des lieux', 'Ne pas ranger après le passage d''un client', 'Reconditionner et replier immédiatement après chaque client.', 'Général', 'important', 2),
    ('Propreté des lieux', 'Négliger le rangement de fin de journée', 'Assurer le rangement complet avant la fermeture.', 'Général', 'important', 3),

    -- Caisse & procédures
    ('Caisse & procédures', 'Erreurs de caisse', 'Encaisser avec rigueur : rendu de monnaie, montants, moyens de paiement.', 'Général', 'important', 1),
    ('Caisse & procédures', 'Échange ou remboursement sans validation du responsable', 'Les échanges et remboursements sont STRICTEMENT réglementés : toujours faire valider par le responsable.', 'Général', 'critique', 2),
    ('Caisse & procédures', 'Ne pas suivre la procédure d''encaissement', 'Respecter la procédure de caisse à chaque transaction (ticket, ouverture/fermeture).', 'Général', 'important', 3),
    ('Caisse & procédures', 'Laisser la caisse ouverte ou sans surveillance', 'Ne jamais laisser la caisse ouverte ou sans surveillance.', 'Général', 'critique', 4),

    -- Téléphone & réseaux
    ('Téléphone & réseaux', 'Utiliser son téléphone perso en service', 'Le téléphone personnel n''a pas sa place en surface pendant le service.', 'Général', 'important', 1),
    ('Téléphone & réseaux', 'Prendre des photos ou vidéos en magasin', 'Pas de photos/vidéos en magasin sans autorisation.', 'Général', 'important', 2),
    ('Téléphone & réseaux', 'Passer des appels privés en rayon', 'Les appels privés se font en dehors du service, hors surface.', 'Général', 'important', 3),

    -- Tenue & attitude
    ('Tenue & attitude', 'Tenue non conforme ou présentation négligée', 'Tenue soignée et conforme aux consignes : image de l''enseigne.', 'Général', 'important', 1),
    ('Tenue & attitude', 'Manque de sourire et d''amabilité', 'Sourire, amabilité et accueil chaleureux avec chaque client.', 'Général', 'important', 2),
    ('Tenue & attitude', 'Attitude fermée ou sur la défensive', 'Rester ouvert(e), à l''écoute et positif(ve), y compris face aux remarques.', 'Général', 'important', 3),
    ('Tenue & attitude', 'Nonchalance', 'Faire preuve d''énergie et d''implication ; éviter la passivité.', 'Général', 'info', 4),

    -- Situations difficiles
    ('Situations difficiles', 'Ne pas garder son calme face à un client mécontent', 'Rester calme, courtois(e) et professionnel(le) face à un client mécontent ; escalader au responsable si besoin.', 'Général', 'important', 1),
    ('Situations difficiles', 'Régler un désaccord devant la clientèle', 'Régler un désaccord (client ou collègue) à l''écart et hors des heures de pointe, jamais devant la clientèle.', 'Général', 'important', 2),

    -- Communication & hiérarchie
    ('Communication & hiérarchie', 'Ne pas signaler un problème ou un incident au responsable', 'Remonter immédiatement tout problème, incident ou anomalie au responsable.', 'Général', 'important', 1),
    ('Communication & hiérarchie', 'Prendre des initiatives non autorisées (remises, prix, gestes commerciaux)', 'Aucune remise, modification de prix ou geste commercial sans accord du responsable.', 'Général', 'critique', 2),
    ('Communication & hiérarchie', 'Ne pas transmettre les informations importantes', 'Transmettre les infos clés : livraisons, ruptures, clients particuliers, consignes.', 'Général', 'important', 3),

    -- Sécurité & anti-vol
    ('Sécurité & anti-vol', 'Négliger la surveillance et la prévention vol', 'Rester vigilant(e) : surveillance active de la surface et prévention du vol.', 'Général', 'important', 1),
    ('Sécurité & anti-vol', 'Laisser des zones sans surveillance', 'Ne pas laisser de zones aveugles ou non surveillées, surtout en affluence.', 'Général', 'important', 2),
    ('Sécurité & anti-vol', 'Ne pas respecter les consignes de sécurité ou de fermeture', 'Appliquer strictement les consignes de sécurité et la procédure de fermeture.', 'Général', 'critique', 3);
  end if;
end $$;
