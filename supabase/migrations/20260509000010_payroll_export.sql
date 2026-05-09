-- Audit log des exports de paie

create table pay_periods_exported (
  id uuid primary key default uuid_generate_v4(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  department_id uuid references departments(id) on delete set null,
  exported_by uuid references profiles(id) on delete set null,
  exported_at timestamptz not null default now(),
  employee_count integer not null default 0,
  total_hours numeric(10,2) not null default 0,
  notes text,
  unique (year, month, department_id)
);
create index idx_payroll_audit_period on pay_periods_exported (year, month);

alter table pay_periods_exported enable row level security;
create policy payroll_audit_rh_all on pay_periods_exported for all using (is_rh()) with check (is_rh());
