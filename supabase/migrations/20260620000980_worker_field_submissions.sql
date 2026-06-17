-- Karim 2026-06-17 : suivi des SOUMISSIONS self-service par le travailleur.
-- Map { champ -> ISO timestamp } posée à chaque fois que le TRAVAILLEUR
-- (et non l'admin) renseigne un champ via son lien magique /contract-info ou
-- son espace /me/contract-info. Sert au statut côté fiche admin :
--   - champ jamais soumis par l'employé  -> orange « non soumis par l'employé »
--   - champ soumis par l'employé          -> vert   « soumis à HH:MM »
alter table public.employees
  add column if not exists worker_field_submissions jsonb not null default '{}'::jsonb;

comment on column public.employees.worker_field_submissions is
  'Soumissions self-service du travailleur : { champ: ISO timestamp }. Posé par les actions /contract-info (lien magique) et /me/contract-info, jamais par la sauvegarde admin.';
