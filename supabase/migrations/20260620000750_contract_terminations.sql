-- Karim 2026-06-01 : table contract_terminations
-- Gere la rupture de contrat de travail de COMMUN ACCORD (lettre officielle 402.00).
-- Initiateur : admin/RH OU travailleur (qui doit alors etre valide par admin/RH).
-- Regle metier : si initie par travailleur, la date effective ne peut etre <
-- requested_at + 3 jours (cooling off).

CREATE TABLE IF NOT EXISTS public.contract_terminations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employer_org_key  text NOT NULL,                          -- 'amd_megastore' / 'caftan_factory'

  -- Initiation
  initiated_by      text NOT NULL,                          -- 'admin' | 'rh' | 'employee'
  initiator_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at      timestamptz NOT NULL DEFAULT now(),
  request_note      text,                                   -- raison cote travailleur

  -- Validation (uniquement si initiation = employee)
  status            text NOT NULL DEFAULT 'pending_admin', -- pending_admin | approved | sent_for_signature | signed_employee | signed_employer | fully_signed | executed | refused | cancelled
  approver_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  approval_note     text,
  refusal_reason    text,

  -- Lettre officielle
  effective_date    date,                                   -- date de cessation du contrat (>= requested_at + 3j si employee-initiated)
  earliest_effective_date date NOT NULL,                    -- requested_at + 3 jours (cas employee) ou today (cas admin)
  city              text DEFAULT 'Schaerbeek',              -- "Fait a <city>"
  employer_representative_name text,                        -- "Represente par : ..."

  -- PDF + signatures (DocuSeal flow)
  pdf_storage_path  text,                                   -- bucket terminations
  docuseal_submission_id text,
  employee_signed_at timestamptz,
  employer_signed_at timestamptz,
  signed_pdf_storage_path text,                             -- version signee finale

  -- Mail
  sent_for_signature_at timestamptz,
  email_outbound_id uuid REFERENCES public.outbound_mails(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CHECK (initiated_by IN ('admin', 'rh', 'employee')),
  CHECK (status IN ('pending_admin', 'approved', 'sent_for_signature', 'signed_employee', 'signed_employer', 'fully_signed', 'executed', 'refused', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_term_employee ON public.contract_terminations(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_term_status ON public.contract_terminations(status);
CREATE INDEX IF NOT EXISTS idx_term_pending_admin
  ON public.contract_terminations(requested_at)
  WHERE status = 'pending_admin';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_contract_terminations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_term_touch ON public.contract_terminations;
CREATE TRIGGER trg_term_touch BEFORE UPDATE ON public.contract_terminations
FOR EACH ROW EXECUTE FUNCTION public.touch_contract_terminations_updated_at();

-- Trigger qui force earliest_effective_date si l initiation est employee :
-- = requested_at + 3 jours (regle metier "cooling off" demandee par Karim 2026-06-01).
CREATE OR REPLACE FUNCTION public.enforce_termination_earliest_date()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.initiated_by = 'employee' THEN
    NEW.earliest_effective_date := (NEW.requested_at::date + INTERVAL '3 days')::date;
  ELSE
    -- admin/RH peuvent fixer la date plus tot, on garde >= today
    IF NEW.earliest_effective_date IS NULL THEN
      NEW.earliest_effective_date := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_term_earliest ON public.contract_terminations;
CREATE TRIGGER trg_term_earliest BEFORE INSERT ON public.contract_terminations
FOR EACH ROW EXECUTE FUNCTION public.enforce_termination_earliest_date();

-- RLS
ALTER TABLE public.contract_terminations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS term_admin_all ON public.contract_terminations;
CREATE POLICY term_admin_all ON public.contract_terminations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'rh')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'rh')));

DROP POLICY IF EXISTS term_employee_own ON public.contract_terminations;
CREATE POLICY term_employee_own ON public.contract_terminations
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE profile_id = auth.uid()));

-- Bucket Storage pour les PDFs termination
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('terminations', 'terminations', false, 10485760, ARRAY['application/pdf', 'text/html', 'text/plain'])
ON CONFLICT (id) DO UPDATE SET allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE public.contract_terminations IS
  'Rupture de contrat de travail de commun accord (lettre 402.00). Initiable par admin/RH ou employee (avec validation RH + cooling-off 3 jours).';
