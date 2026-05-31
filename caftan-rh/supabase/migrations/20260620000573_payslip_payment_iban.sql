-- Karim 2026-05-30 : IBAN beneficiaire extrait du PDF HR Consult
alter table public.payslips add column if not exists payment_iban text;
alter table public.payslips add column if not exists payment_holder_name text;
