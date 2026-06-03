-- Karim 2026-06-03 : module notes de frais (expense reports).
-- Workflow : employee soumet → photo justif → manager/RH valide →
-- payment via virement IBAN + QR EPC SEPA.

CREATE TABLE IF NOT EXISTS public.expense_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  -- Détails dépense
  amount          numeric(8, 2) NOT NULL CHECK (amount > 0),
  expense_date    date NOT NULL,
  category        text NOT NULL,  -- 'transport', 'meal', 'office', 'parking', 'fuel', 'other'
  description     text,
  vendor          text,           -- commerçant/fournisseur
  vat_amount      numeric(8, 2),  -- TVA si applicable

  -- Justificatif
  receipt_storage_path text,      -- bucket expense-receipts
  receipt_filename     text,

  -- Workflow
  status          text NOT NULL DEFAULT 'pending', -- pending / approved / refused / paid / cancelled
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewer_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note     text,
  refusal_reason  text,

  -- Paiement
  paid_at         timestamptz,
  paid_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payment_qr_data text,           -- QR EPC069-12 SEPA encoded

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CHECK (status IN ('pending', 'approved', 'refused', 'paid', 'cancelled')),
  CHECK (category IN ('transport', 'meal', 'office', 'parking', 'fuel', 'lodging', 'training', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_expense_employee ON public.expense_reports(employee_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_status ON public.expense_reports(status);
CREATE INDEX IF NOT EXISTS idx_expense_pending ON public.expense_reports(submitted_at) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.touch_expense_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_expense_touch ON public.expense_reports;
CREATE TRIGGER trg_expense_touch BEFORE UPDATE ON public.expense_reports
FOR EACH ROW EXECUTE FUNCTION public.touch_expense_updated_at();

ALTER TABLE public.expense_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_admin ON public.expense_reports;
CREATE POLICY expense_admin ON public.expense_reports
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh','manager')));

DROP POLICY IF EXISTS expense_own_select ON public.expense_reports;
CREATE POLICY expense_own_select ON public.expense_reports
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS expense_own_insert ON public.expense_reports;
CREATE POLICY expense_own_insert ON public.expense_reports
  FOR INSERT TO authenticated
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE profile_id = auth.uid()));

-- Bucket pour photos justificatifs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('expense-receipts', 'expense-receipts', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE public.expense_reports IS 'Notes de frais avec workflow validation + remboursement IBAN QR SEPA.';
