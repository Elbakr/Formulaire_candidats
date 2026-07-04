-- Karim 2026-07-04 (debug) : champs secrétariat social sur employees (n'existaient
-- que sur candidates). Sans eux, la reprise à l'embauche d'un pré-validé echouait
-- (update entier rejete). Additif nullable.
alter table public.employees
  add column if not exists nationality text,
  add column if not exists education_level text,
  add column if not exists marital_status text,
  add column if not exists dependent_children integer;
