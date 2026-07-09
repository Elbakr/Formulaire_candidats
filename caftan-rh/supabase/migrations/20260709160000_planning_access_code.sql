-- Karim 2026-07-09 (Phase 3) : CODE PERSONNEL d'accès au planning tablette.
--
-- Chaque travailleur reçoit un code court (5-6 chiffres) qu'il saisit sur une
-- tablette PARTAGÉE en magasin (page publique /tablette) pour consulter SON
-- planning par défaut en lecture seule. Le code est une COMMODITÉ (tablette
-- magasin), pas une auth forte — c'est assumé. Il est communiqué MANUELLEMENT
-- au travailleur (aucun envoi automatique).
--
-- Index unique PARTIEL sur les valeurs non-null : deux travailleurs ne peuvent
-- pas partager le même code, mais plusieurs peuvent avoir NULL (pas encore de
-- code). Additif, nullable, idempotent.

alter table public.employees
  add column if not exists planning_access_code text;

create unique index if not exists uq_employees_planning_access_code
  on public.employees(planning_access_code)
  where planning_access_code is not null;
