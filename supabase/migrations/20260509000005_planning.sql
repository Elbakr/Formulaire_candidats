-- GestiPlanning : employés, shifts, congés
-- Auto-promotion candidat → employé quand application.status = 'hired'

create type employee_status as enum ('active', 'on_leave', 'archived');
create type shift_status as enum ('planned', 'confirmed', 'done', 'cancelled');
create type time_off_kind as enum ('vacation', 'sick', 'personal', 'unpaid', 'other');
create type time_off_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table employees (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid unique references profiles(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete set null,
  application_id uuid references applications(id) on delete set null,
  email text not null,
  full_name text not null,
  phone text,
  job_title text,
  department_id uuid references departments(id) on delete set null,
  manager_id uuid references profiles(id) on delete set null,
  contract_type text,
  weekly_hours integer default 38,
  hourly_rate numeric(6,2),
  start_date date not null default current_date,
  end_date date,
  status employee_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_employees_dept on employees (department_id);
create index idx_employees_manager on employees (manager_id);
create index idx_employees_status on employees (status);

create table shifts (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0,
  position text,
  location text,
  status shift_status not null default 'planned',
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_shifts_employee_date on shifts (employee_id, date);
create index idx_shifts_date on shifts (date);

create table time_off_requests (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  kind time_off_kind not null default 'vacation',
  start_date date not null,
  end_date date not null,
  status time_off_status not null default 'pending',
  reason text,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index idx_timeoff_employee on time_off_requests (employee_id);
create index idx_timeoff_status on time_off_requests (status);

-- updated_at triggers
create trigger trg_employees_updated before update on employees
  for each row execute function set_updated_at();
create trigger trg_shifts_updated before update on shifts
  for each row execute function set_updated_at();

-- Auto-promotion : quand un application passe à 'hired', on crée l'employé
create or replace function promote_application_to_employee()
returns trigger as $$
declare
  cand record;
  job record;
begin
  if new.status = 'hired' and (old.status is distinct from 'hired') then
    select * into cand from candidates where id = new.candidate_id;
    if cand is null then return new; end if;

    -- évite les doublons si déjà promu
    if exists (select 1 from employees where application_id = new.id) then
      return new;
    end if;

    select * into job from jobs where id = new.job_id;

    insert into employees (
      profile_id, candidate_id, application_id,
      email, full_name, phone,
      job_title, department_id, manager_id, contract_type,
      start_date
    ) values (
      cand.profile_id, cand.id, new.id,
      cand.email, cand.full_name, cand.phone,
      coalesce(job.title, 'À définir'),
      job.department_id,
      new.assigned_manager,
      coalesce(job.contract_type, 'CDI'),
      current_date
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_application_hired
  after update of status on applications
  for each row execute function promote_application_to_employee();

-- RLS
alter table employees enable row level security;
alter table shifts enable row level security;
alter table time_off_requests enable row level security;

-- Employés : self read, manager read leur équipe, RH/admin read all
create policy employees_self_read on employees for select
  using (profile_id = auth.uid() or manager_id = auth.uid() or is_rh());
create policy employees_rh_write on employees for all using (is_rh()) with check (is_rh());
create policy employees_self_update_phone on employees for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Shifts : self read, manager/RH read all + write
create policy shifts_self_read on shifts for select
  using (
    is_manager()
    or exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
  );
create policy shifts_manager_write on shifts for all using (is_manager()) with check (is_manager());

-- Congés : self read + write own pending; manager/RH lit tout + décide
create policy timeoff_self_read on time_off_requests for select
  using (
    is_manager()
    or exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
  );
create policy timeoff_self_create on time_off_requests for insert to authenticated
  with check (
    exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
  );
create policy timeoff_self_cancel on time_off_requests for update
  using (
    exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
    and status = 'pending'
  )
  with check (status in ('pending','cancelled'));
create policy timeoff_manager_decide on time_off_requests for update
  using (is_manager()) with check (is_manager());

-- Realtime
alter publication supabase_realtime add table shifts;
alter publication supabase_realtime add table time_off_requests;
alter publication supabase_realtime add table employees;
