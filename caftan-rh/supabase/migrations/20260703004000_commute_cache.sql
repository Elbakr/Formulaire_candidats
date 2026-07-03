-- Karim 2026-07-03 : cache du trajet domicile -> 2 sièges (distance routière +
-- temps voiture + temps transports en commun), calculé via Google Routes API et
-- mis en cache (jamais d'appel API au rendu). Donnée DÉRIVÉE d'une adresse déjà
-- stockée, usage interne admin (aide au recrutement/mobilité) — RGPD conforme.
alter table public.candidates
  add column if not exists commute jsonb,
  add column if not exists commute_computed_at timestamptz;
alter table public.employees
  add column if not exists commute jsonb,
  add column if not exists commute_computed_at timestamptz;
