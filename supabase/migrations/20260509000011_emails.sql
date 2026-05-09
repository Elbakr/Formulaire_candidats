-- Email templates + extension org_settings pour les variables emails

create table email_templates (
  slug text primary key,
  label text not null,
  subject text not null,
  body_html text not null,
  category text default 'general',
  needs_dates boolean default false,
  needs_times boolean default false,
  is_active boolean default true,
  updated_at timestamptz default now()
);

create trigger trg_email_templates_updated before update on email_templates
  for each row execute function set_updated_at();

alter table email_templates enable row level security;
create policy email_tmpl_read on email_templates for select using (is_manager());
create policy email_tmpl_rh_write on email_templates for all using (is_rh()) with check (is_rh());

-- Extend org_settings
alter table org_settings
  add column if not exists org_email text default 'hr@caftanfactory.com',
  add column if not exists org_phone text default '+32 468 59 61 00',
  add column if not exists org_whatsapp text default '32468596100',
  add column if not exists org_address text default 'Rue de Brabant 230, 1030 Schaerbeek (Bruxelles)';
