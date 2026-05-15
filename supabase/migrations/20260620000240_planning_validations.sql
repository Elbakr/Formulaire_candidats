-- Workflow de validation des plannings par les employes.
-- Karim 15/05/2026 :
--  "Le RH doit pouvoir activer la demande de validation par les employes
--   des plannings generes, cette activation est facultative mais
--   obligatoire avant chaque grand rush (vacances scolaires, jours feries
--   internationaux, 15 derniers jours du Ramadan, jours feries qui tombent
--   avant ou apres le weekend). Cette obligation reste bypassable par le
--   RH en cas de besoin urgent. Les jours manques ou annules par les
--   travailleurs apres validation font descendre le score du travailleur."

begin;

-- Un "run" de validation = une demande emise par le RH pour une semaine
-- donnee (et optionnellement un site). Contient le statut global et les
-- conditions de creation (auto/manuel, obligation declenchee, bypass).
create table if not exists planning_validation_runs (
  id uuid primary key default gen_random_uuid(),
  week_iso date not null,
  site_id uuid references sites(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deadline_at timestamptz,
  obligation_reason text,
  was_mandatory boolean not null default false,
  was_bypassed boolean not null default false,
  bypass_reason text,
  status text not null default 'pending' check (status in ('pending','closed','cancelled'))
);

create index if not exists idx_pvr_week on planning_validation_runs(week_iso);
create index if not exists idx_pvr_site on planning_validation_runs(site_id);
create index if not exists idx_pvr_status on planning_validation_runs(status);

-- Une "response" = la validation (ou refus) d un employe pour un run.
-- Idempotent par (run_id, employee_id) -- une seule reponse par employe.
create table if not exists planning_validation_responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references planning_validation_runs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  validated_at timestamptz,
  refused_at timestamptz,
  response text check (response in ('accepted','refused','no_response')),
  notes text,
  cancelled_after_validation boolean not null default false,
  cancelled_at timestamptz,
  cancellation_reason text,
  unique (run_id, employee_id)
);

create index if not exists idx_pvr_resp_emp on planning_validation_responses(employee_id);

-- RLS : RH/admin gerent les runs. Les employees voient leurs propres responses.
alter table planning_validation_runs enable row level security;
alter table planning_validation_responses enable row level security;

drop policy if exists pvr_select_all on planning_validation_runs;
create policy pvr_select_all on planning_validation_runs
  for select using (true);

drop policy if exists pvr_insert_rh on planning_validation_runs;
create policy pvr_insert_rh on planning_validation_runs
  for insert with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin','rh','manager')
    )
  );

drop policy if exists pvr_update_rh on planning_validation_runs;
create policy pvr_update_rh on planning_validation_runs
  for update using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin','rh','manager')
    )
  );

drop policy if exists pvr_resp_select on planning_validation_responses;
create policy pvr_resp_select on planning_validation_responses
  for select using (
    -- RH/admin/manager voient tout
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin','rh','manager')
    )
    or
    -- L employe voit ses propres responses
    exists (
      select 1 from employees e
      where e.id = planning_validation_responses.employee_id
        and e.profile_id = auth.uid()
    )
  );

drop policy if exists pvr_resp_insert on planning_validation_responses;
create policy pvr_resp_insert on planning_validation_responses
  for insert with check (
    -- RH peut inserer pour tout employe
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin','rh','manager')
    )
    or
    -- L employe valide pour lui-meme
    exists (
      select 1 from employees e
      where e.id = planning_validation_responses.employee_id
        and e.profile_id = auth.uid()
    )
  );

drop policy if exists pvr_resp_update on planning_validation_responses;
create policy pvr_resp_update on planning_validation_responses
  for update using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin','rh','manager')
    )
    or
    exists (
      select 1 from employees e
      where e.id = planning_validation_responses.employee_id
        and e.profile_id = auth.uid()
    )
  );

commit;
