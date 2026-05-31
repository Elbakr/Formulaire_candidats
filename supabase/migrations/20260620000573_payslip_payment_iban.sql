-- Karim 2026-05-30 : extraire l IBAN beneficiaire directement depuis le PDF
-- HR Consult ("FORMULE DE PAIEMENT BE.. de NOM Prenom") et le stocker sur
-- la payslip. Permet de generer le QR meme si l employee n a pas son IBAN
-- en BD, et de propager l IBAN PDF vers employees.iban automatiquement.

alter table public.payslips add column if not exists payment_iban text;
alter table public.payslips add column if not exists payment_holder_name text;
