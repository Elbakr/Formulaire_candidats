-- Module 4 — Coefficients de rush horaire (AUTOPLAN_RULES).
--
-- Profil de rush horaire par site (pondération de la demande client par tranche
-- horaire). Repris de planning-employes.html getRushProfile().
-- Permet au solver de prioriser les employés expérimentés sur les pics 14h-17h
-- et les juniors sur les creux 10h-12h.
--
-- site_id = NULL  → profil global par défaut.
-- day_of_week = NULL → applicable à tous les jours.
--
-- Idempotente.

create table if not exists rush_profile_segments (
  id uuid primary key default uuid_generate_v4(),
  site_id uuid references sites(id) on delete cascade, -- null = profil global
  day_of_week smallint check (
    day_of_week is null or (day_of_week between 0 and 6)
  ), -- 0=Dim..6=Sam, null = tous les jours
  start_minute int not null check (start_minute >= 0 and start_minute <= 1440),
  end_minute int not null check (end_minute > 0 and end_minute <= 1440),
  weight numeric(4,2) not null check (weight >= 0),
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_minute > start_minute)
);

create index if not exists idx_rush_site
  on rush_profile_segments (site_id, day_of_week);
create index if not exists idx_rush_active
  on rush_profile_segments (is_active) where is_active = true;

-- Multiplicateurs globaux + toggle solver (org_settings).
alter table org_settings
  add column if not exists rush_saturday_multiplier numeric(3,2) default 1.4,
  add column if not exists rush_holiday_multiplier numeric(3,2) default 1.3,
  add column if not exists rush_special_multiplier numeric(3,2) default 1.2,
  add column if not exists rush_period_forte_multiplier numeric(3,2) default 1.15,
  add column if not exists rush_use_in_solver boolean default true;

alter table rush_profile_segments enable row level security;

drop policy if exists rps_read on rush_profile_segments;
drop policy if exists rps_admin on rush_profile_segments;
create policy rps_read on rush_profile_segments
  for select using (true);
create policy rps_admin on rush_profile_segments
  for all using (is_rh()) with check (is_rh());

do $$ begin
  begin
    alter publication supabase_realtime add table rush_profile_segments;
  exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
