-- Karim 2026-07-11 (étape 2 séjour) : travailleur DÉTACHÉ (posté) — employeur
-- étranger, secondé en Belgique. Nécessite Limosa + A1. Flag admin sur la fiche ;
-- l'audit et le droit au travail signalent alors la vérification Limosa/A1.
alter table public.employees
  add column if not exists posted_worker boolean not null default false;
