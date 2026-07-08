-- Karim 2026-07-08 : PHASE 1 « conformité travailleur » (par phases, journal de
-- manquements dédié + accusés de réception du guide conduite).
--
-- Trois briques, toutes idempotentes :
--   1) worker_compliance_events  : LE journal de manquements (INTERNE, RH only).
--   2) worker_document_acks      : accusés de réception des documents (guide conduite).
--   3) org_settings.auto_scoring_communication : flag (Phase 2) — n'active RIEN encore.
--
-- Écriture : via service-role (createAdminClient bypass RLS). RLS = lecture admin/rh.
-- Le scoring/journal reste INTERNE : jamais communiqué au travailleur (Phase 1).

-- ── 1) Journal de manquements ───────────────────────────────────────────────
create table if not exists public.worker_compliance_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null,                                  -- 'questionnaire_non_complete' | 'guide_non_confirme' | autre
  title text not null,
  detail text,
  malus int not null default 1,
  status text not null default 'open',                 -- 'open' | 'resolved'
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_wce_employee_status
  on public.worker_compliance_events(employee_id, status);

alter table public.worker_compliance_events enable row level security;
drop policy if exists wce_read on public.worker_compliance_events;
create policy wce_read on public.worker_compliance_events for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin','rh'));

-- ── 2) Accusés de réception (guide conduite, …) ─────────────────────────────
create table if not exists public.worker_document_acks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  document_key text not null,                          -- ex. 'guide_conduite'
  sent_at timestamptz,
  read_ok boolean not null default false,
  understood_ok boolean not null default false,
  assimilated_ok boolean not null default false,
  accepted_ok boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, document_key)
);
create index if not exists idx_wda_employee
  on public.worker_document_acks(employee_id);

alter table public.worker_document_acks enable row level security;
-- Lecture admin/rh ; l'écriture publique de confirmation passe par service-role.
drop policy if exists wda_read on public.worker_document_acks;
create policy wda_read on public.worker_document_acks for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin','rh'));

create or replace function public.touch_worker_document_acks() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_touch_wda on public.worker_document_acks;
create trigger trg_touch_wda before update on public.worker_document_acks
  for each row execute function public.touch_worker_document_acks();

-- ── 3) Anti-doublon relance questionnaire d'accueil ─────────────────────────
-- reminded_at : posé par le cron onboarding-followup quand la relance 24h part.
alter table public.pre_interviews
  add column if not exists reminded_at timestamptz;

-- ── 4) Réglage (Phase 2) : communication auto du scoring ────────────────────
-- Pour l'instant ce flag n'active RIEN : il est juste exposé dans /admin/settings.
alter table public.org_settings
  add column if not exists auto_scoring_communication boolean not null default false;
comment on column public.org_settings.auto_scoring_communication is
  'Phase 2 : pilote la communication AUTOMATIQUE du scoring au travailleur. false = rien envoyé (le journal reste interne).';
