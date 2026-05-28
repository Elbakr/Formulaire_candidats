-- Karim 2026-05-24 : integration Tuya Cloud pour pointage materiel (acces
-- control biometrique). 3 tables :
--   - tuya_devices : mapping terminal physique -> site CaftanRH
--   - tuya_user_mapping : mapping user_id Tuya + direction (in/out) -> employee
--   - tuya_sync_state : derniere date de poll, pour les requetes incrementales
--
-- Notes RGPD : aucune empreinte stockee. L API Tuya ne renvoie que des
-- user_id + horodatages. On stocke uniquement ces metadonnees.

create table if not exists tuya_devices (
  id uuid primary key default uuid_generate_v4(),
  tuya_device_id text not null unique,
  tuya_device_name text,
  site_id uuid not null references sites(id) on delete cascade,
  -- Karim 24/05 : un site sans terminal physique peut deferrer son pointage
  -- a un autre site (ex: D Brabant -> terminal A Brabant, meme rue).
  fallback_for_site_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tuya_devices_site_idx on tuya_devices(site_id);
create index if not exists tuya_devices_active_idx on tuya_devices(is_active) where is_active;

create table if not exists tuya_user_mapping (
  id uuid primary key default uuid_generate_v4(),
  tuya_user_id text not null,
  tuya_device_id text references tuya_devices(tuya_device_id) on delete cascade,
  tuya_name text,
  employee_id uuid not null references employees(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique(tuya_user_id, direction)
);

create index if not exists tuya_user_mapping_employee_idx on tuya_user_mapping(employee_id) where is_active;
create index if not exists tuya_user_mapping_tuya_idx on tuya_user_mapping(tuya_user_id, direction);

create table if not exists tuya_sync_state (
  id text primary key,
  last_sync_at timestamptz not null default now(),
  last_log_access_time bigint,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Extension clock_entries pour distinguer source (selfie/geofence vs tuya).
alter table clock_entries
  add column if not exists source text not null default 'manual',
  add column if not exists tuya_device_id text,
  add column if not exists tuya_user_id text,
  add column if not exists tuya_access_log_id text unique,
  add column if not exists auto_clocked_out boolean not null default false;

comment on column clock_entries.source is
  'Karim 2026-05-24 : ''manual''|''selfie''|''geofence''|''tuya''|''auto_close''. Distingue la provenance du pointage.';
comment on column clock_entries.auto_clocked_out is
  'Karim 2026-05-24 : TRUE si l OUT a ete force par le cron (employe oublie son OUT). Combine avec source=auto_close.';

-- RLS : admin/rh/manager peuvent lire/ecrire les tables Tuya
alter table tuya_devices enable row level security;
alter table tuya_user_mapping enable row level security;
alter table tuya_sync_state enable row level security;

drop policy if exists tuya_devices_read on tuya_devices;
create policy tuya_devices_read on tuya_devices
  for select to authenticated using (is_manager());
drop policy if exists tuya_devices_write on tuya_devices;
create policy tuya_devices_write on tuya_devices
  for all to authenticated using (is_manager()) with check (is_manager());

drop policy if exists tuya_user_mapping_read on tuya_user_mapping;
create policy tuya_user_mapping_read on tuya_user_mapping
  for select to authenticated using (is_manager());
drop policy if exists tuya_user_mapping_write on tuya_user_mapping;
create policy tuya_user_mapping_write on tuya_user_mapping
  for all to authenticated using (is_manager()) with check (is_manager());

drop policy if exists tuya_sync_state_read on tuya_sync_state;
create policy tuya_sync_state_read on tuya_sync_state
  for select to authenticated using (is_manager());
drop policy if exists tuya_sync_state_write on tuya_sync_state;
create policy tuya_sync_state_write on tuya_sync_state
  for all to authenticated using (is_manager()) with check (is_manager());
