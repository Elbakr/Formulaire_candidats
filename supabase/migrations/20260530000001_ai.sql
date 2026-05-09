-- Vague 3 — AI infrastructure : ai_outputs (cache), ai_audit (telemetry), agent_actions (HITL queue)
--
-- Tables :
--   ai_outputs    : cache des réponses IA (clé = task + input_hash)
--   ai_audit     : journal complet de chaque appel IA (RGPD + budget)
--   agent_actions: file d'attente d'actions proposées par les agents IA, validées par l'humain
--
-- Étend org_settings avec les paramètres IA (provider, modèles, budget, autonomie)
-- Active la realtime sur agent_actions pour la mise à jour live de l'Inbox

create table ai_outputs (
  id uuid primary key default uuid_generate_v4(),
  task text not null,
  input_hash text not null,
  output jsonb not null,
  model text,
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric(10,6),
  cached boolean default false,
  created_at timestamptz not null default now()
);
create unique index uniq_ai_outputs_task_hash on ai_outputs (task, input_hash);
create index idx_ai_outputs_recent on ai_outputs (task, created_at desc);

create table ai_audit (
  id uuid primary key default uuid_generate_v4(),
  task text not null,
  called_by uuid references profiles(id) on delete set null,
  application_id uuid references applications(id) on delete set null,
  candidate_id uuid references candidates(id) on delete set null,
  employee_id uuid references employees(id) on delete set null,
  model text,
  duration_ms integer,
  success boolean,
  error text,
  cost_usd numeric(10,6),
  cached boolean default false,
  created_at timestamptz not null default now()
);
create index idx_ai_audit_recent on ai_audit (created_at desc);
create index idx_ai_audit_task on ai_audit (task, created_at desc);

create type agent_action_status as enum ('proposed','approved','rejected','executed','expired');

create table agent_actions (
  id uuid primary key default uuid_generate_v4(),
  kind text not null,
  status agent_action_status not null default 'proposed',
  payload jsonb not null,
  target_type text,
  target_id uuid,
  proposed_by_agent text,
  ai_confidence numeric(3,2),
  proposed_at timestamptz not null default now(),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  executed_at timestamptz,
  expires_at timestamptz default (now() + interval '7 days')
);
create index idx_agent_actions_pending on agent_actions (status, proposed_at desc) where status = 'proposed';
create index idx_agent_actions_target on agent_actions (target_type, target_id, proposed_at desc);

alter table ai_outputs enable row level security;
alter table ai_audit enable row level security;
alter table agent_actions enable row level security;

create policy ai_outputs_rh on ai_outputs for select using (is_rh());
create policy ai_audit_rh on ai_audit for select using (is_rh());
create policy agent_actions_read on agent_actions for select using (is_manager());
create policy agent_actions_rh_write on agent_actions for all using (is_rh()) with check (is_rh());

alter table org_settings
  add column if not exists ai_autonomy_level smallint default 0,
  add column if not exists ai_provider text default 'anthropic',
  add column if not exists ai_model_strong text default 'claude-sonnet-4-6',
  add column if not exists ai_model_fast text default 'claude-haiku-4-5-20251001',
  add column if not exists ai_budget_usd_monthly numeric(10,2) default 50;

alter publication supabase_realtime add table agent_actions;
