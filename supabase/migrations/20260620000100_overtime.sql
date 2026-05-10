-- Heures supplémentaires (overtime) — règle métier 2026-05-11
-- Tag des shifts overtime au niveau du shift, pour pouvoir les distinguer
-- visuellement (badge orange) sans toucher à l'enum shift_status.
-- Idempotent : peut être ré-appliqué sans casser une base déjà migrée.

alter table shifts add column if not exists is_overtime boolean not null default false;
alter table shifts add column if not exists overtime_multiplier numeric(3,2);

-- Index partiel : lookup rapide des shifts overtime pour les vues admin/RH.
create index if not exists idx_shifts_overtime
  on shifts (is_overtime)
  where is_overtime = true;

-- Paramètres globaux pour piloter la phase 2 (overtime opt-in) du solver.
alter table org_settings add column if not exists overtime_default_multiplier numeric(3,2) default 1.5;
alter table org_settings add column if not exists overtime_min_pause_minutes int default 15;
alter table org_settings add column if not exists overtime_auto_approve boolean default false;
