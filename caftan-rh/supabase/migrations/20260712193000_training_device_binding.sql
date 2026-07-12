-- Karim 2026-07-12 : la formation est accessible UNIQUEMENT sur l'appareil du
-- travailleur (lien non partageable). Même mécanisme que les tablettes : à la 1re
-- ouverture, un secret d'appareil est posé en cookie httpOnly et son empreinte
-- (sha256) stockée ici. Ensuite, /former/<token> n'est servi que depuis cet appareil.
alter table public.training_enrollments
  add column if not exists bound_secret text,
  add column if not exists bound_at timestamptz;
