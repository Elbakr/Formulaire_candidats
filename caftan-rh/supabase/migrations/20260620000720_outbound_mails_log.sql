-- Karim 2026-05-31 : journal centralisé de tous les mails sortants envoyés
-- depuis la plateforme (DocuSeal signature, info_request, payslip share,
-- payslip archive employeur, magic link, screening_request, manual).
--
-- Permet :
--   - onglet "Mails envoyés" cote RH (filtre par employee/type/date)
--   - onglet "Mails reçus" cote travailleur (mails à son email)
--   - section "Mails envoyés" sur fiche employee
--   - audit & traçabilité

create table if not exists public.outbound_mails (
  id uuid primary key default gen_random_uuid(),

  -- Origine
  sent_at timestamptz not null default now(),
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_name text default 'Caftan Factory (By AMD Megastore)',
  from_email text default 'hr@caftanfactory.com',

  -- Destinataire
  recipient_email text not null,
  recipient_name text,
  employee_id uuid references public.employees(id) on delete set null,
  candidate_id uuid references public.candidates(id) on delete set null,

  -- Contenu
  subject text not null,
  body text,
  body_html text,
  attachments jsonb default '[]'::jsonb,  -- [{name, url, size}]
  source text not null,                   -- 'contract_signature' | 'info_request' | 'payslip_share' | 'payslip_archive' | 'magic_link' | 'screening_request' | 'manual' | 'tunnel_recap'
  source_ref text,                        -- ex: docuseal_submission_id, payslip_id, screening_response_id

  -- Statut envoi
  status text default 'sent',             -- 'sent' | 'failed' | 'opened' | 'replied'
  delivery_provider text default 'emailjs', -- 'emailjs' | 'supabase' | 'manual'
  error_message text,

  -- Threading (optionnel - lien vers une conversation existante)
  email_thread_id uuid references public.email_threads(id) on delete set null,

  -- Audit
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_outbound_mails_recipient on public.outbound_mails(recipient_email);
create index if not exists idx_outbound_mails_employee on public.outbound_mails(employee_id) where employee_id is not null;
create index if not exists idx_outbound_mails_source on public.outbound_mails(source);
create index if not exists idx_outbound_mails_sent_at on public.outbound_mails(sent_at desc);

alter table public.outbound_mails enable row level security;

-- RH/admin voient tout
drop policy if exists "outbound_mails_rh_read" on public.outbound_mails;
create policy "outbound_mails_rh_read" on public.outbound_mails for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));

-- Employee voit les mails qui lui ont été envoyés (par email match ou employee_id)
drop policy if exists "outbound_mails_employee_own_read" on public.outbound_mails;
create policy "outbound_mails_employee_own_read" on public.outbound_mails for select
  using (
    employee_id in (select id from public.employees where profile_id = auth.uid())
    or recipient_email = (select email from public.profiles where id = auth.uid())
  );

-- Insert : admin/rh (le helper logOutboundMail() est appelé depuis server actions)
drop policy if exists "outbound_mails_rh_write" on public.outbound_mails;
create policy "outbound_mails_rh_write" on public.outbound_mails for insert
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));

-- Trigger updated_at
create or replace function public.touch_outbound_mails() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_touch_outbound_mails on public.outbound_mails;
create trigger trg_touch_outbound_mails before update on public.outbound_mails
  for each row execute function public.touch_outbound_mails();
