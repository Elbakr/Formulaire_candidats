-- Gravity Forms : config + dédup

create table if not exists gf_settings (
  id integer primary key default 1 check (id = 1),
  wp_url text default 'https://caftanfactory.com',
  ck text,
  cs text,
  form_id integer default 4,
  field_map jsonb default '{
    "firstname": "1",
    "lastname": "2",
    "birthdate": "4",
    "email": "5",
    "phone": "6",
    "cv_url": "7",
    "available_from": "8",
    "worktime": "10",
    "role": "13",
    "city": "14",
    "days_prefix": "11"
  }'::jsonb,
  last_synced_at timestamptz,
  last_sync_count integer default 0,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into gf_settings (id) values (1) on conflict (id) do nothing;

create trigger trg_gf_settings_updated before update on gf_settings
  for each row execute function set_updated_at();

alter table gf_settings enable row level security;
create policy gf_admin_all on gf_settings for all using (is_admin()) with check (is_admin());
create policy gf_rh_read on gf_settings for select using (is_rh());

-- Dédup sur candidates : un identifiant unique par entrée GF importée
alter table candidates add column if not exists gf_entry_id text;
create unique index if not exists uniq_candidates_gf_entry on candidates (gf_entry_id) where gf_entry_id is not null;
alter table candidates add column if not exists raw_payload jsonb;

-- Une "spontanée" générique pour les imports GF qui n'ont pas de job_id
-- (l'application sera créée sans job lié)
