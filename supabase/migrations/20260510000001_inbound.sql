-- Vague 1 — Inbound emails + threads + attachments + freeform mode
--
-- Ajoute :
--   - inbound_emails (raw payload + matching state)
--   - email_threads (regroupement par application + sujet racine)
--   - colonnes messages.thread_id / message_id_header / in_reply_to_header / from_email / from_name / attachments
--   - email_templates.allow_freeform
--   - bucket Storage `inbound-attachments` + RLS
--   - RLS sur les nouvelles tables + ajout au publication realtime

create table inbound_emails (
  id uuid primary key default uuid_generate_v4(),
  from_email text not null,
  from_name text,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  message_id text,
  in_reply_to text,
  references_header text,
  headers jsonb default '{}'::jsonb,
  raw jsonb,
  attachments jsonb default '[]'::jsonb,
  matched_application_id uuid references applications(id) on delete set null,
  matched_via text,
  match_confidence numeric(3,2),
  status text not null default 'pending',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_inbound_status on inbound_emails (status, received_at desc);
create index idx_inbound_app on inbound_emails (matched_application_id, received_at desc);
create index idx_inbound_from_email on inbound_emails (lower(from_email));

create table email_threads (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id) on delete cascade,
  subject_root text,
  last_message_at timestamptz,
  message_count integer default 0,
  created_at timestamptz not null default now()
);
create unique index idx_threads_app_subject on email_threads (application_id, lower(subject_root));
create index idx_threads_last on email_threads (last_message_at desc);

alter table messages
  add column if not exists thread_id uuid references email_threads(id) on delete set null,
  add column if not exists message_id_header text,
  add column if not exists in_reply_to_header text,
  add column if not exists from_email text,
  add column if not exists from_name text,
  add column if not exists attachments jsonb default '[]'::jsonb;

create index if not exists idx_messages_thread on messages (thread_id, created_at);
create index if not exists idx_messages_message_id_header on messages (message_id_header);

alter table email_templates
  add column if not exists allow_freeform boolean default true;

-- Storage bucket for inbound attachments
insert into storage.buckets (id, name, public) values ('inbound-attachments', 'inbound-attachments', false)
  on conflict (id) do nothing;

create policy "inbound_attachments_rh_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'inbound-attachments' and is_manager());

create policy "inbound_attachments_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'inbound-attachments' and is_rh());

-- RLS
alter table inbound_emails enable row level security;
alter table email_threads enable row level security;
create policy inbound_rh_read on inbound_emails for select using (is_manager());
create policy inbound_rh_write on inbound_emails for all using (is_rh()) with check (is_rh());
create policy threads_rh_read on email_threads for select using (is_manager());
create policy threads_rh_write on email_threads for all using (is_rh()) with check (is_rh());

-- Realtime
alter publication supabase_realtime add table inbound_emails;
alter publication supabase_realtime add table email_threads;
