-- Karim 2026-07-03 : ne plus archiver un employé en fin de contrat tant que son
-- "pack de sortie" (fiches de paie payées + C4/documents sociaux) n'a pas été
-- envoyé. Le cron gate l'archivage sur ce timestamp ; l'envoi du pack le remplit,
-- puis l'archivage se fait automatiquement.
alter table public.employees
  add column if not exists offboarding_pack_sent_at timestamptz;

comment on column public.employees.offboarding_pack_sent_at is
  'Horodatage d''envoi du pack de sortie. Tant que NULL et contrat terminé, le cron n''archive pas (employé "en sortie") et notifie RH.';
