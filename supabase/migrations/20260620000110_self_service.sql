-- Self-service module — auto-déclaration dispos employé +
-- auto-validation congés (panneau de config + audit).
-- Migration 100% idempotente.
--
-- Ajoute :
--   * employee_unavailabilities : indispos déclarées par l'employé
--     (récurrentes par jour de semaine OU ponctuelles à une date précise),
--     avec créneau horaire optionnel.
--   * org_settings : paramètres auto-validation congés (préavis, %
--     absents simultanés max, durée max, périodes interdites).
--   * time_off_requests : flag + raison auto-validation pour audit et UI.
--   * RLS + Realtime.

-- 1) Table employee_unavailabilities
create table if not exists employee_unavailabilities (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  -- 0=Dim..6=Sam (cohérent avec site_needs.day_of_week / Date.getDay()).
  day_of_week smallint check (day_of_week between 0 and 6),
  date_specific date,
  start_time time,
  end_time time,
  reason text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  -- XOR : soit récurrence hebdo, soit date précise — jamais les deux.
  check ((day_of_week is not null) <> (date_specific is not null)),
  -- Si une heure de début est saisie, la fin doit être après.
  check (start_time is null or end_time is null or end_time > start_time)
);
create index if not exists idx_emp_unavail_emp on employee_unavailabilities (employee_id, is_active);
create index if not exists idx_emp_unavail_dow on employee_unavailabilities (day_of_week) where is_active = true;
create index if not exists idx_emp_unavail_date on employee_unavailabilities (date_specific) where is_active = true;

-- 2) Org settings : paramètres auto-validation congés
alter table org_settings add column if not exists leave_auto_min_notice_days int default 14;
alter table org_settings add column if not exists leave_auto_max_pct_absents_per_site int default 30;
alter table org_settings add column if not exists leave_auto_max_consecutive_days int default 10;
alter table org_settings add column if not exists leave_blocked_periods jsonb default '["sales","ramadan_aid","year_end","wed_sat"]'::jsonb;
-- Possibilités : 'sales' (1-31 jan + 1-31 juil), 'ramadan_aid'
-- (calculé via holidays islamic priority>=2), 'year_end' (15 déc - 15 jan),
-- 'wed_sat' (mercredi et samedi — jours forts boutique).

-- 3) Audit auto-validation sur time_off_requests
alter table time_off_requests add column if not exists auto_validated boolean default false;
alter table time_off_requests add column if not exists auto_validation_reason text;
-- 'all_rules_passed' / 'in_blocked_period' / 'too_many_absents'
-- / 'preavis_too_short' / 'too_long' / 'manual_override'

-- 4) RLS — employee_unavailabilities
alter table employee_unavailabilities enable row level security;

drop policy if exists eu_self_read     on employee_unavailabilities;
drop policy if exists eu_self_write    on employee_unavailabilities;
drop policy if exists eu_manager_read  on employee_unavailabilities;
drop policy if exists eu_admin_all     on employee_unavailabilities;

create policy eu_self_read on employee_unavailabilities for select using (
  exists(select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
);
create policy eu_self_write on employee_unavailabilities for all using (
  exists(select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
) with check (
  exists(select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
);
create policy eu_manager_read on employee_unavailabilities for select using (is_manager());
create policy eu_admin_all on employee_unavailabilities for all using (is_rh()) with check (is_rh());

-- 5) Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table employee_unavailabilities;
  exception when duplicate_object then null;
  end;
end $$;
