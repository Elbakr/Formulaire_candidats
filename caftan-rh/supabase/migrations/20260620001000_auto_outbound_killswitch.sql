-- Karim 2026-07-02 : kill-switch des envois AUTOMATIQUES (outreach) vers les
-- candidats et les travailleurs. false (défaut) = AUCUN email automatique n'est
-- envoyé aux personnes (rappels entretien, convocations, refus, offres, relances
-- signature, notices de fin). Les envois manuels, l'auth et les confirmations
-- (reçus d'une action) ne sont PAS concernés.
alter table public.org_settings
  add column if not exists auto_outbound_to_people_enabled boolean not null default false;

comment on column public.org_settings.auto_outbound_to_people_enabled is
  'Si false (défaut) : le système n''envoie AUCUN email automatique (outreach) aux candidats/travailleurs. Réglable dans /admin/settings.';
