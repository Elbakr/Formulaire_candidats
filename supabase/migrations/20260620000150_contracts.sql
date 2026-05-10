-- Module 2 — Embauche & Onboarding
-- Contrats employés (V1 — essentiel CDD/CDI belge) + checklist Dimona
-- Idempotente.

-- ============================================================
-- 1) employee_contracts
-- ============================================================
create table if not exists employee_contracts (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,

  -- Identité (snapshot au moment de la préparation du contrat)
  full_name text not null,
  birth_date date,
  birth_place text,
  nrn text, -- numéro national
  address text,
  postal_code text,
  city text,

  -- Contrat
  contract_kind text not null, -- 'CDI' | 'CDD' | 'Étudiant' | 'Intérim' | 'Freelance'
  start_date date not null,
  end_date date, -- null pour CDI
  weekly_hours numeric(4,1) not null default 38.0,
  monthly_hours numeric(5,1),
  position_title text not null,
  workplace text not null,
  workplace_address text,
  trial_period_weeks int,

  -- Rémunération
  gross_hourly_rate numeric(6,2),
  gross_monthly_salary numeric(8,2),
  meal_voucher_eur_per_day numeric(4,2) default 0,
  transport_allowance text,

  -- Légal Belgique
  joint_committee text default 'CP 201 Commerce de détail indépendant',
  paid_holidays_days int default 20,
  weekly_rest_day text default 'dimanche',

  -- État
  status text not null default 'draft', -- 'draft' | 'ready_to_sign' | 'signed' | 'archived'
  prepared_at timestamptz default now(),
  signed_at timestamptz,
  signed_by_admin uuid references profiles(id) on delete set null,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_contracts_employee on employee_contracts (employee_id);
create index if not exists idx_contracts_status on employee_contracts (status);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_contracts_updated_at') then
    create trigger trg_contracts_updated_at before update on employee_contracts
    for each row execute function set_updated_at();
  end if;
end $$;

alter table employee_contracts enable row level security;
drop policy if exists ec_admin_all on employee_contracts;
drop policy if exists ec_self_read on employee_contracts;
create policy ec_admin_all on employee_contracts for all using (is_rh()) with check (is_rh());
create policy ec_self_read on employee_contracts for select using (
  exists(select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
);

-- ============================================================
-- 2) dimona_declarations
-- ============================================================
create table if not exists dimona_declarations (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  contract_id uuid references employee_contracts(id) on delete set null,
  declaration_kind text not null, -- 'IN' | 'UPDATE' | 'OUT' | 'CANCEL'
  start_date date not null,
  end_date date,
  worker_type text default 'OTH',
  status text not null default 'pending',
  -- 'pending' | 'declared_onss' | 'confirmed' | 'rejected'
  reference_number text,
  declared_at timestamptz,
  declared_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_dimona_employee on dimona_declarations (employee_id, status);

alter table dimona_declarations enable row level security;
drop policy if exists dd_admin on dimona_declarations;
create policy dd_admin on dimona_declarations for all using (is_rh()) with check (is_rh());

-- ============================================================
-- 3) Realtime (best effort, idempotent)
-- ============================================================
do $$ begin
  begin alter publication supabase_realtime add table employee_contracts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table dimona_declarations; exception when duplicate_object then null; end;
end $$;
