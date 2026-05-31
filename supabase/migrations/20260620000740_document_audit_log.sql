-- Karim 2026-05-31 : journal d'audit des partages + consultations de documents
-- (fiches de paie, contrats, etc.) par travailleur. Horodaté + actor.
-- Permet d'avoir un historique propre par employé : qui a partagé quoi, quand,
-- et qui l'a effectivement consulté (via redirect endpoint sur signed URLs).

CREATE TABLE IF NOT EXISTS public.document_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),

  -- Cible : un employee (toujours) ; et optionnellement un candidate
  employee_id  uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,

  -- Document concerné
  doc_type    text NOT NULL,                  -- 'payslip', 'contract', 'cv', 'screening_pdf', 'misc'
  doc_ref     text NOT NULL,                  -- id interne du doc (payslip_id, contract_id…)
  doc_label   text,                           -- libellé human-readable (ex: "Fiche de paie mai 2026")

  -- Action
  action      text NOT NULL,                  -- 'share_email', 'share_link', 'view', 'download', 'screenshot'
  channel     text,                           -- 'emailjs', 'manual_compose', 'direct_link', 'in_app'

  -- Qui a fait l'action (admin/RH dans le cas share, ou null si view anonyme)
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name       text,                      -- snapshot du nom (au cas où profile supprimé)

  -- Détails partage / view
  recipient_email text,                       -- si share via email
  ip_address      text,                       -- view : IP du consultant
  user_agent      text,                       -- view : UA du consultant
  signed_url_path text,                       -- chemin storage du PDF servi
  notes           text,

  -- Optionnel : lien vers le mail sortant si action = share_email
  outbound_mail_id uuid REFERENCES public.outbound_mails(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_doc_audit_employee
  ON public.document_audit_log(employee_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_audit_doc
  ON public.document_audit_log(doc_type, doc_ref);
CREATE INDEX IF NOT EXISTS idx_doc_audit_occurred
  ON public.document_audit_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_audit_action
  ON public.document_audit_log(action);

-- RLS
ALTER TABLE public.document_audit_log ENABLE ROW LEVEL SECURITY;

-- RH/admin : lecture totale
DROP POLICY IF EXISTS doc_audit_admin_read ON public.document_audit_log;
CREATE POLICY doc_audit_admin_read ON public.document_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'rh')
    )
  );

-- Employé : ne voit que ses propres lignes
DROP POLICY IF EXISTS doc_audit_employee_self ON public.document_audit_log;
CREATE POLICY doc_audit_employee_self ON public.document_audit_log
  FOR SELECT TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE profile_id = auth.uid())
  );

COMMENT ON TABLE public.document_audit_log IS
  'Journal horodaté des partages + consultations de documents par travailleur.';
