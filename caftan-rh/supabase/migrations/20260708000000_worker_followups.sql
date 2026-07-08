-- Karim 2026-07-08 : ACCOMPAGNEMENT AUTOMATIQUE du travailleur PAR PALIERS.
--
-- Le cron /api/cron/worker-followup envoie des mails d'accompagnement au
-- travailleur au fil de son parcours :
--   - Phase 1 (4 premières semaines) : un mail tous les 7 jours -> J+7/14/21/28.
--   - Phase 2 (au-delà d'1 mois)      : un mail tous les 10 jours -> J+38/48/58…
--
-- Cette table trace CHAQUE palier envoyé pour garantir l'ANTI-DOUBLON strict :
-- la contrainte unique (employee_id, milestone) empêche de renvoyer deux fois le
-- même palier au même travailleur, même si le cron rejoue.
--
-- `milestone` : identifiant textuel du palier, ex. 'w1_day7','w1_day14',
-- 'w1_day21','w1_day28' (Phase 1) puis 'p2_day38','p2_day48',… (Phase 2).
--
-- Tout est idempotent (if not exists) — ré-exécutable sans effet de bord.

create table if not exists public.worker_followups (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  milestone text not null,             -- ex. 'w1_day7' | 'p2_day38'
  phase text,                          -- 'p1' | 'p2' (informatif)
  sent_at timestamptz not null default now(),
  unique (employee_id, milestone)      -- ANTI-DOUBLON strict par palier
);

create index if not exists idx_worker_followups_employee on public.worker_followups(employee_id);

-- RLS : écrit/lu via le service role (cron). On active RLS et on laisse admin/rh
-- lire/agir depuis l'app (même pattern que worker_reports).
alter table public.worker_followups enable row level security;
drop policy if exists worker_followups_admin on public.worker_followups;
create policy worker_followups_admin on public.worker_followups for all
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
