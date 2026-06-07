-- Karim 2026-05-31 : journal centralisé mails sortants
create table if not exists public.outbound_mails (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_name text default 'Caftan Factory (By AMD Megastore)',
  from_email text default 'hr@caftanfactory.com',
  recipient_email text not null,
  recipient_name text,
  employee_id uuid references public.employees(id) on delete set null,
  candidate_id uuid references public.candidates(id) on delete set null,
  subject text not null,
  body text,
  body_html text,
  attachments jsonb default '[]'::jsonb,
  source text not null,
  source_ref text,
  status text default 'sent',
  delivery_provider text default 'emailjs',
  error_message text,
  email_thread_id uuid references public.email_threads(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_outbound_mails_recipient on public.outbound_mails(recipient_email);
create index if not exists idx_outbound_mails_employee on public.outbound_mails(employee_id) where employee_id is not null;
create index if not exists idx_outbound_mails_source on public.outbound_mails(source);
create index if not exists idx_outbound_mails_sent_at on public.outbound_mails(sent_at desc);
alter table public.outbound_mails enable row level security;
drop policy if exists "outbound_mails_rh_read" on public.outbound_mails;
create policy "outbound_mails_rh_read" on public.outbound_mails for select using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
drop policy if exists "outbound_mails_employee_own_read" on public.outbound_mails;
create policy "outbound_mails_employee_own_read" on public.outbound_mails for select using (employee_id in (select id from public.employees where profile_id = auth.uid()) or recipient_email = (select email from public.profiles where id = auth.uid()));
drop policy if exists "outbound_mails_rh_write" on public.outbound_mails;
create policy "outbound_mails_rh_write" on public.outbound_mails for insert with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
create or replace function public.touch_outbound_mails() returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_touch_outbound_mails on public.outbound_mails;
create trigger trg_touch_outbound_mails before update on public.outbound_mails for each row execute function public.touch_outbound_mails();
