-- Vague 2 — WhatsApp via Twilio
--
-- Ajoute :
--   - whatsapp_settings (singleton row id=1)
--   - colonnes messages.whatsapp_sid / wa_to_phone / wa_from_phone
--   - RLS

create table if not exists whatsapp_settings (
  id integer primary key default 1 check (id = 1),
  twilio_account_sid text,
  twilio_auth_token text,         -- masked when read by UI
  twilio_whatsapp_number text,    -- format "whatsapp:+14155238886" (sandbox) or paid number
  is_sandbox boolean default true,
  webhook_url text,               -- our endpoint for inbound (computed)
  enabled boolean default false,
  last_send_at timestamptz,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into whatsapp_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_wa_settings_updated on whatsapp_settings;
create trigger trg_wa_settings_updated before update on whatsapp_settings
  for each row execute function set_updated_at();

-- Map a Twilio MessageSid to our messages row for inbound matching of replies
alter table messages
  add column if not exists whatsapp_sid text,
  add column if not exists wa_to_phone text,
  add column if not exists wa_from_phone text;
create index if not exists idx_messages_whatsapp_sid on messages (whatsapp_sid) where whatsapp_sid is not null;

alter table whatsapp_settings enable row level security;
drop policy if exists wa_settings_admin on whatsapp_settings;
drop policy if exists wa_settings_rh_read on whatsapp_settings;
create policy wa_settings_admin on whatsapp_settings for all using (is_admin()) with check (is_admin());
create policy wa_settings_rh_read on whatsapp_settings for select using (is_rh());
