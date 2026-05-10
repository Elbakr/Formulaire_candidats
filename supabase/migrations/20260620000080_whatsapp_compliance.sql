-- Vague 2 — WhatsApp compliance (anti-ban Meta)
--
-- Ajoute :
--   - colonnes opt-in / blocked / last_inbound_at sur candidates
--   - table whatsapp_templates (slug + Twilio Content SID + status)
--   - colonnes de quotas et règles sur whatsapp_settings
--
-- 100% idempotente — peut être ré-exécutée sans risque.

-- ---------------------------------------------------------------------------
-- 1. candidates : colonnes de consentement / opt-in / opt-out
-- ---------------------------------------------------------------------------
alter table candidates
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists whatsapp_opt_in_at timestamptz,
  add column if not exists whatsapp_last_inbound_at timestamptz,
  add column if not exists whatsapp_blocked boolean not null default false,
  add column if not exists whatsapp_block_reason text;

create index if not exists idx_candidates_wa_last_inbound
  on candidates (whatsapp_last_inbound_at)
  where whatsapp_last_inbound_at is not null;

-- ---------------------------------------------------------------------------
-- 2. whatsapp_templates : référentiel des templates approuvés Meta
-- ---------------------------------------------------------------------------
create table if not exists whatsapp_templates (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  language_code text not null default 'fr',
  category text not null default 'UTILITY'
    check (category in ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  body text not null,
  variables_count integer not null default 0,
  twilio_content_sid text,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wa_templates_status
  on whatsapp_templates (status);
create index if not exists idx_wa_templates_active
  on whatsapp_templates (is_active) where is_active = true;

drop trigger if exists trg_wa_templates_updated on whatsapp_templates;
create trigger trg_wa_templates_updated before update on whatsapp_templates
  for each row execute function set_updated_at();

alter table whatsapp_templates enable row level security;

drop policy if exists wa_templates_admin on whatsapp_templates;
drop policy if exists wa_templates_rh_read on whatsapp_templates;
drop policy if exists wa_templates_manager_read on whatsapp_templates;

create policy wa_templates_admin on whatsapp_templates
  for all using (is_rh()) with check (is_rh());
create policy wa_templates_manager_read on whatsapp_templates
  for select using (is_manager());

-- ---------------------------------------------------------------------------
-- 3. whatsapp_settings : quotas et règles de conformité
-- ---------------------------------------------------------------------------
alter table whatsapp_settings
  add column if not exists daily_send_limit integer not null default 250,
  add column if not exists hourly_send_limit integer not null default 60,
  add column if not exists min_seconds_between_sends integer not null default 5,
  add column if not exists require_opt_in boolean not null default true,
  add column if not exists enforce_24h_window boolean not null default true,
  add column if not exists out_of_window_template_slug text;

-- ---------------------------------------------------------------------------
-- 4. activity log kinds — on s'appuie sur le champ texte libre (pas d'enum)
--    donc rien à faire schema-side. Les nouveaux kinds :
--    - whatsapp.sent
--    - whatsapp.blocked
--    - whatsapp.template_required
--    - whatsapp.opt_in
--    - whatsapp.opt_out
-- ---------------------------------------------------------------------------
