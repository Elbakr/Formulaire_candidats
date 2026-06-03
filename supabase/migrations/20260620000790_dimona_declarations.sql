-- Karim 2026-06-03 : tracking des déclarations Dimona ONSS par employé.

CREATE TABLE IF NOT EXISTS public.dimona_declarations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employer_org_key text NOT NULL,                 -- amd_megastore / caftan_factory
  kind            text NOT NULL,                  -- 'in' / 'out' / 'update'

  -- Données déclaration
  declared_start_date date,                       -- IN : date entrée
  declared_end_date   date,                       -- OUT : date fin
  worker_type     text NOT NULL DEFAULT 'OTH',    -- 'OTH' / 'STU' (etudiant) / 'EXT'

  -- État
  status          text NOT NULL DEFAULT 'pending', -- pending / declared / failed / cancelled
  declared_at     timestamptz,                    -- quand admin a marqué déclarée
  declared_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  dimona_period_id text,                          -- ID retourné par ONSS (optionnel)

  -- Notes
  note            text,                           -- libre admin

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CHECK (kind IN ('in', 'out', 'update')),
  CHECK (status IN ('pending', 'declared', 'failed', 'cancelled')),
  UNIQUE (employee_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_dimona_employee ON public.dimona_declarations(employee_id);
CREATE INDEX IF NOT EXISTS idx_dimona_status ON public.dimona_declarations(status);
CREATE INDEX IF NOT EXISTS idx_dimona_pending_in
  ON public.dimona_declarations(created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.touch_dimona_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_dimona_touch ON public.dimona_declarations;
CREATE TRIGGER trg_dimona_touch BEFORE UPDATE ON public.dimona_declarations
FOR EACH ROW EXECUTE FUNCTION public.touch_dimona_updated_at();

ALTER TABLE public.dimona_declarations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dimona_admin ON public.dimona_declarations;
CREATE POLICY dimona_admin ON public.dimona_declarations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh')));

COMMENT ON TABLE public.dimona_declarations IS
  'Tracking déclarations Dimona ONSS (IN/OUT) par employé. status=pending tant que admin n a pas confirmé sur le portail.';
