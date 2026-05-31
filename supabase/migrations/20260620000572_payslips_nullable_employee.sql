-- Karim 2026-05-30 : permet les payslips orphelines (employee_id = null)
-- pour que les fiches non-matchees automatiquement soient visibles dans
-- l UI et puissent etre re-affectees manuellement.

alter table public.payslips alter column employee_id drop not null;

-- Drop l index unique qui ne supporte pas null + recree avec partial pour
-- exclure les orphelines de la contrainte
drop index if exists public.uq_payslips_employee_month_secondary;
create unique index if not exists uq_payslips_employee_month_secondary
  on public.payslips(employee_id, period_year, period_month, is_secondary)
  where employee_id is not null;
