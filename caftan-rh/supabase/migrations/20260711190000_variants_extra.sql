-- Karim 2026-07-11 : variants d'appoint (D, E, F…) pour couvrir l'ouverture→
-- fermeture des petits contrats. Additif : on garde variant_a/b/c, on ajoute un
-- tableau des variants supplémentaires (vide pour les volumes standards).
alter table public.planning_proposals
  add column if not exists variants_extra jsonb not null default '[]'::jsonb;
