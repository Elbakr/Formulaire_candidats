-- Scoring équipe : évaluations manager + métriques auto + score global

create table evaluations (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  evaluator_id uuid references profiles(id) on delete set null,
  period_start date not null,
  period_end date not null,
  scores jsonb not null default '{}'::jsonb,
  total numeric(3,2),
  comment text,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index idx_evaluations_employee on evaluations (employee_id, created_at desc);

create or replace function eval_total() returns trigger as $$
begin
  new.total := (
    coalesce((new.scores->>'fiabilite')::numeric, 0) +
    coalesce((new.scores->>'autonomie')::numeric, 0) +
    coalesce((new.scores->>'esprit_equipe')::numeric, 0) +
    coalesce((new.scores->>'qualite')::numeric, 0) +
    coalesce((new.scores->>'presentation')::numeric, 0)
  ) / 5.0;
  return new;
end;
$$ language plpgsql;

create trigger trg_eval_total before insert or update on evaluations
  for each row execute function eval_total();

-- Métriques auto-calculées (mise à jour par cron)
create table employee_metrics (
  employee_id uuid primary key references employees(id) on delete cascade,
  reliability_pct numeric(5,2) default 100,
  coverage_pct numeric(5,2) default 100,
  punctuality_pct numeric(5,2) default 100,
  time_off_days_12m integer default 0,
  shifts_total integer default 0,
  shifts_done integer default 0,
  shifts_no_show integer default 0,
  computed_at timestamptz not null default now()
);

-- Recalcul des métriques pour un employé (12 derniers mois)
create or replace function recompute_employee_metrics(emp_id uuid)
returns void as $$
declare
  v_total int := 0;
  v_done int := 0;
  v_no_show int := 0;
  v_scheduled numeric := 0;
  v_worked numeric := 0;
  v_off_days int := 0;
begin
  select
    count(*),
    count(*) filter (where status = 'done'),
    count(*) filter (where status = 'no_show'),
    coalesce(sum(extract(epoch from (end_time - start_time))/3600.0 - break_minutes/60.0), 0),
    coalesce(sum(extract(epoch from (end_time - start_time))/3600.0 - break_minutes/60.0)
             filter (where status = 'done'), 0)
  into v_total, v_done, v_no_show, v_scheduled, v_worked
  from shifts
  where employee_id = emp_id
    and date >= current_date - interval '12 months';

  select coalesce(sum(end_date - start_date + 1), 0) into v_off_days
  from time_off_requests
  where employee_id = emp_id and status = 'approved'
    and start_date >= current_date - interval '12 months';

  insert into employee_metrics (
    employee_id, reliability_pct, coverage_pct, time_off_days_12m,
    shifts_total, shifts_done, shifts_no_show, computed_at
  )
  values (
    emp_id,
    case when v_total > 0 then round((v_done::numeric / v_total) * 100, 2) else 100 end,
    case when v_scheduled > 0 then round((v_worked / v_scheduled) * 100, 2) else 100 end,
    v_off_days, v_total, v_done, v_no_show, now()
  )
  on conflict (employee_id) do update set
    reliability_pct = excluded.reliability_pct,
    coverage_pct = excluded.coverage_pct,
    time_off_days_12m = excluded.time_off_days_12m,
    shifts_total = excluded.shifts_total,
    shifts_done = excluded.shifts_done,
    shifts_no_show = excluded.shifts_no_show,
    computed_at = excluded.computed_at;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function recompute_all_employee_metrics()
returns integer as $$
declare
  c integer := 0;
  emp record;
begin
  for emp in select id from employees where status = 'active' loop
    perform recompute_employee_metrics(emp.id);
    c := c + 1;
  end loop;
  return c;
end;
$$ language plpgsql security definer set search_path = public;

-- Vue agrégée pour leaderboard
create or replace view employee_scores as
select
  e.id as employee_id,
  e.full_name,
  e.job_title,
  e.department_id,
  e.status,
  e.profile_id,
  e.manager_id,
  d.name as department_name,
  m.reliability_pct,
  m.coverage_pct,
  m.shifts_total,
  m.shifts_done,
  m.shifts_no_show,
  m.time_off_days_12m,
  m.computed_at as metrics_updated_at,
  (
    select avg(total) from evaluations ev
    where ev.employee_id = e.id and ev.created_at >= now() - interval '12 months'
  ) as avg_manager_score,
  (
    select count(*) from evaluations ev
    where ev.employee_id = e.id and ev.created_at >= now() - interval '12 months'
  ) as evals_12m,
  round(
    coalesce((
      select avg(total) * 20 from evaluations ev
      where ev.employee_id = e.id and ev.created_at >= now() - interval '12 months'
    ), 0) * 0.5
    + coalesce((m.reliability_pct + m.coverage_pct) / 2, 100) * 0.5
  , 1) as global_score
from employees e
left join departments d on d.id = e.department_id
left join employee_metrics m on m.employee_id = e.id;

-- RLS
alter table evaluations enable row level security;
alter table employee_metrics enable row level security;

-- Évaluations : manager+RH+admin peuvent lire/écrire ; employé lit ses propres
create policy evals_self_read on evaluations for select
  using (
    is_manager()
    or exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
  );
create policy evals_manager_write on evaluations for insert with check (is_manager());
create policy evals_self_update on evaluations for update using (evaluator_id = auth.uid()) with check (evaluator_id = auth.uid());
create policy evals_rh_delete on evaluations for delete using (is_rh());

-- Métriques : lecture par manager+RH+admin et l'employé concerné ; écriture seulement service-role (via fonction)
create policy metrics_read on employee_metrics for select
  using (
    is_manager()
    or exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
  );

-- Realtime
alter publication supabase_realtime add table evaluations;
alter publication supabase_realtime add table employee_metrics;
