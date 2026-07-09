-- Karim 2026-07-09 : PROPOSITION DE PLANNING AUTOMATIQUE (Phase 1).
--
-- À la SIGNATURE du contrat (ou via un bouton sur la fiche), on génère une
-- PROPOSITION de planning sur 3 semaines, en 2 variantes valides distinctes,
-- sauvegardée sur la fiche du travailleur. AUCUN envoi au travailleur : l'admin
-- est seulement NOTIFIÉ. La sélection de la variante par défaut = Phase 2.
--
-- « UNE SEULE proposition courante par employé » : la contrainte unique
-- (employee_id) garantit qu'on ne garde QUE la dernière version — chaque
-- (re)génération fait un upsert (on écrase l'ancienne).
--
-- variant_a / variant_b : JSON auto-porteur (semaines -> shifts { date,
-- start_time, end_time, hours, pause? }). Format logique aligné sur `shifts`
-- (date/start_time/end_time) mais stocké tel quel (pas de FK vers shifts : ce
-- sont des PROPOSITIONS, pas des shifts committés).
--
-- Tout est idempotent (if not exists) — ré-exécutable sans effet de bord.

create table if not exists public.planning_proposals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date date not null,
  weeks int not null default 3,
  variant_a jsonb not null,
  variant_b jsonb not null,
  selected_variant text,                 -- null | 'A' | 'B' (Phase 2)
  status text not null default 'draft',
  -- Emplacement « génération programmée/récurrente » (Phase 2 : la vraie
  -- récurrence sera câblée plus tard ; ici on ne fait que STOCKER le choix UI).
  schedule_recurrence text,              -- null | 'none' | 'weekly' | 'monthly'
  reason text,                           -- best-effort : raison si proposition vide
  generated_at timestamptz not null default now(),
  generated_by text,                     -- 'signature' | 'manual:<profile_id>' | ...
  constraint planning_proposals_selected_variant_ck
    check (selected_variant is null or selected_variant in ('A', 'B')),
  constraint planning_proposals_one_current_per_employee unique (employee_id)
);

create index if not exists idx_planning_proposals_employee
  on public.planning_proposals(employee_id);

-- RLS : lu/écrit par le service role (trigger signature) ET par admin/rh depuis
-- l'app (même pattern que worker_followups / worker_reports).
alter table public.planning_proposals enable row level security;
drop policy if exists planning_proposals_admin on public.planning_proposals;
create policy planning_proposals_admin on public.planning_proposals for all
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
