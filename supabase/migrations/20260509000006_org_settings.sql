-- Org settings : ligne unique pour les paramètres globaux

create table org_settings (
  id integer primary key default 1 check (id = 1),
  org_name text not null default 'CaftanRH',
  email_signature text default '',
  timezone text default 'Europe/Brussels',
  default_language text default 'fr-BE',
  logo_url text,
  updated_at timestamptz not null default now()
);

insert into org_settings (id) values (1) on conflict (id) do nothing;

alter table org_settings enable row level security;
create policy org_read_all on org_settings for select using (true);
create policy org_admin_write on org_settings for all using (is_admin()) with check (is_admin());

create trigger trg_org_updated before update on org_settings
  for each row execute function set_updated_at();
