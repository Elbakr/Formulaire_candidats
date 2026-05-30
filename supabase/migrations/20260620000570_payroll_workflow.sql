-- Karim 2026-05-29 : workflow fiches de paie HR Consult
-- Tables : payslips, employer_bank_accounts, payslip_batches
-- Colonne : employees.salary_advance_amount

-- ============ 1. Comptes bancaires employeurs ============
create table if not exists public.employer_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  employer_org_key text not null,
  holder_name text not null,
  iban text not null,
  bic text,
  bank_name text default 'BNP Paribas Fortis',
  is_default boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_employer_bank_org on public.employer_bank_accounts(employer_org_key);

alter table public.employer_bank_accounts enable row level security;
drop policy if exists "admin rh read bank accounts" on public.employer_bank_accounts;
create policy "admin rh read bank accounts" on public.employer_bank_accounts for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
drop policy if exists "admin manage bank accounts" on public.employer_bank_accounts;
create policy "admin manage bank accounts" on public.employer_bank_accounts for all
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- ============ 2. Avance salariale sur employees ============
alter table public.employees add column if not exists salary_advance_amount numeric(10, 2) default 0.00;
alter table public.employees add column if not exists salary_advance_updated_at timestamptz;
alter table public.employees add column if not exists salary_advance_note text;

-- ============ 3. Fiches de paie ============
create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  employer_org_key text not null,
  period_year integer not null,
  period_month integer not null,
  period_label text,
  gross_amount numeric(10, 2),
  net_amount numeric(10, 2) not null,
  advance_deducted numeric(10, 2) default 0.00,
  amount_to_pay numeric(10, 2) not null,
  pdf_storage_path text,
  pdf_filename text,
  source_batch_id uuid,
  qr_epc_payload text,
  qr_png_data_url text,
  is_secondary boolean default false,
  scheduled_payment_date date,
  paired_with_payslip_id uuid references public.payslips(id) on delete set null,
  payment_status text default 'pending',
  paid_at timestamptz,
  paid_amount numeric(10, 2),
  payment_note text,
  hrconsult_doc_ref text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_payslips_employee_period on public.payslips(employee_id, period_year, period_month);
create index if not exists idx_payslips_status on public.payslips(payment_status);
create index if not exists idx_payslips_scheduled on public.payslips(scheduled_payment_date) where payment_status in ('pending', 'scheduled');
create unique index if not exists uq_payslips_employee_month_secondary
  on public.payslips(employee_id, period_year, period_month, is_secondary);

alter table public.payslips enable row level security;
drop policy if exists "admin rh read payslips" on public.payslips;
create policy "admin rh read payslips" on public.payslips for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
drop policy if exists "employee read own payslips" on public.payslips;
create policy "employee read own payslips" on public.payslips for select
  using (employee_id in (select id from public.employees where profile_id = auth.uid()));
drop policy if exists "admin manage payslips" on public.payslips;
create policy "admin manage payslips" on public.payslips for all
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));

-- ============ 4. Batch d import ============
create table if not exists public.payslip_batches (
  id uuid primary key default gen_random_uuid(),
  employer_org_key text not null,
  source text not null,
  source_filename text,
  uploaded_by uuid references public.profiles(id),
  pdf_storage_path text,
  total_pages integer,
  payslips_count integer default 0,
  status text default 'processing',
  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

alter table public.payslip_batches enable row level security;
drop policy if exists "admin rh read batches" on public.payslip_batches;
create policy "admin rh read batches" on public.payslip_batches for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
drop policy if exists "admin manage batches" on public.payslip_batches;
create policy "admin manage batches" on public.payslip_batches for all
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));

-- ============ 5. Trigger updated_at ============
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_payslips on public.payslips;
create trigger touch_payslips before update on public.payslips
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_employer_bank_accounts on public.employer_bank_accounts;
create trigger touch_employer_bank_accounts before update on public.employer_bank_accounts
  for each row execute function public.touch_updated_at();

-- ============ 6. Comptes AMD Megastore + Caftan Factory (a completer) ============
insert into public.employer_bank_accounts (employer_org_key, holder_name, iban, bic, bank_name, is_default, notes)
values
  ('amd_megastore', 'AMD MEGASTORE SRL', 'BE00 0000 0000 0000', 'GEBABEBB', 'BNP Paribas Fortis', true, 'Compte a completer avec le vrai IBAN'),
  ('caftan_factory', 'CAFTAN FACTORY SRL', 'BE00 0000 0000 0000', 'GEBABEBB', 'BNP Paribas Fortis', true, 'Compte a completer avec le vrai IBAN')
on conflict do nothing;
