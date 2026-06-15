-- Karim 2026-06-15 : cascade de remplacement urgent.
--
-- Quand une absence urgente survient, la demande part d'abord au RH. Si le RH
-- n'accuse pas reception manuellement sous `reinforcement_rh_timeout_minutes`
-- (defaut 20 min), l'agent declenche une cascade : il propose le remplacement
-- aux employes DISPONIBLES (plages declarees couvrant le creneau) UN PAR UN,
-- classes par fiabilite+performance (employee_scores.global_score DESC, puis
-- reliability_pct DESC), a intervalle `reinforcement_cascade_interval_minutes`
-- (defaut 5 min) chacun, jusqu'a ce qu'un accepte ou qu'il n'y ait plus de
-- candidat.
--
-- ADDITIF : ne touche a aucune colonne/table existante, ajoute seulement.
-- Idempotente (re-executable sans effet de bord).

-- 1) Journal des propositions (trace complete, anti double-envoi) ----------
create table if not exists public.reinforcement_proposal_log (
  id uuid primary key default gen_random_uuid(),
  reinforcement_id uuid references public.reinforcement_requests(id) on delete cascade,
  employee_id uuid,
  sequence_order int,
  status text default 'sent',          -- sent | accepted | declined | expired | superseded
  proposed_at timestamptz default now(),
  expires_at timestamptz,
  responded_at timestamptz,
  response text
);

create index if not exists idx_reinf_proposal_log_reinf
  on public.reinforcement_proposal_log(reinforcement_id);
create index if not exists idx_reinf_proposal_log_emp
  on public.reinforcement_proposal_log(reinforcement_id, employee_id);
create index if not exists idx_reinf_proposal_log_status
  on public.reinforcement_proposal_log(status);

-- 2) Colonnes additives sur reinforcement_requests -------------------------
alter table public.reinforcement_requests
  add column if not exists is_urgent boolean default false;
alter table public.reinforcement_requests
  add column if not exists rh_acknowledged_at timestamptz;
alter table public.reinforcement_requests
  add column if not exists cascade_active boolean default false;
alter table public.reinforcement_requests
  add column if not exists current_proposal_id uuid;

-- 3) Parametres org_settings (defauts) -------------------------------------
alter table public.org_settings
  add column if not exists reinforcement_rh_timeout_minutes int default 20;
alter table public.org_settings
  add column if not exists reinforcement_cascade_interval_minutes int default 5;

-- Backfill : applique les defauts a la ligne unique existante (id=1) si null.
update public.org_settings
  set reinforcement_rh_timeout_minutes = coalesce(reinforcement_rh_timeout_minutes, 20),
      reinforcement_cascade_interval_minutes = coalesce(reinforcement_cascade_interval_minutes, 5);

-- 4) RLS : lecture admin/rh sur le journal (ecriture via service role) ------
alter table public.reinforcement_proposal_log enable row level security;

drop policy if exists "reinf_proposal_log_read" on public.reinforcement_proposal_log;
create policy "reinf_proposal_log_read" on public.reinforcement_proposal_log for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));

-- Recharge le cache de schema PostgREST pour exposer les nouvelles colonnes.
notify pgrst, 'reload schema';
