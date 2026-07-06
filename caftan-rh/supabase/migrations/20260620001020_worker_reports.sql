-- Karim 2026-07-06 : « Signaler à la direction » — canal INBOUND permanent du
-- travailleur vers la direction, valable pendant tout le contrat.
--
--   1) table worker_reports : les signalements du travailleur (remarque, anomalie,
--      info, autre) + statut de traitement RH (new/read/handled).
--   2) colonne employees.report_token : token DURABLE (n'expire jamais) qui
--      donne accès à la page publique /signaler/[token]. Un seul par employé,
--      généré paresseusement au 1er envoi de la fiche d'onboarding.
--
-- Tout est idempotent (if not exists) — ré-exécutable sans effet de bord.

create table if not exists public.worker_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  category text,                                  -- 'remarque'|'anomalie'|'info'|'autre' (libre)
  message text not null,
  status text not null default 'new',             -- 'new'|'read'|'handled'
  created_at timestamptz not null default now()
);

create index if not exists idx_worker_reports_employee on public.worker_reports(employee_id);
create index if not exists idx_worker_reports_status on public.worker_reports(status);
create index if not exists idx_worker_reports_employee_status on public.worker_reports(employee_id, status);

-- Token durable par employé (lien permanent /signaler/[token]). N'EXPIRE PAS.
alter table public.employees add column if not exists report_token text;
create unique index if not exists uq_employees_report_token on public.employees(report_token);

-- RLS : la table est écrite/lue via le service role (page publique no-auth +
-- fiche RH). On active RLS et on laisse admin/rh lire/agir depuis l'app.
alter table public.worker_reports enable row level security;
drop policy if exists worker_reports_admin on public.worker_reports;
create policy worker_reports_admin on public.worker_reports for all
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
