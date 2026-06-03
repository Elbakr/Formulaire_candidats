-- Karim 2026-06-03 : modules formations + certifications.
-- Permet de tracker les compétences obligatoires (HACCP, sécurité, langues,
-- etc.), les dates d'expiration et envoyer des rappels auto.

CREATE TABLE IF NOT EXISTS public.training_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  -- Type
  kind            text NOT NULL,   -- 'haccp' / 'first_aid' / 'fire_safety' / 'languages' / 'cash_register' / 'other'
  title           text NOT NULL,   -- libellé libre (ex: "HACCP niveau 1 — secteur alimentaire")
  provider        text,            -- organisme formateur

  -- Dates
  obtained_at     date NOT NULL,
  expires_at      date,            -- NULL si pas d'expiration

  -- Niveau
  level           text,            -- 'beginner' / 'intermediate' / 'advanced' / N/A
  score           numeric(5, 2),   -- % réussite si test
  hours_completed numeric(5, 1),   -- nombre d'heures

  -- Certificat
  certificate_storage_path text,   -- bucket training-certificates
  certificate_filename text,

  -- Statut & rappels
  status          text NOT NULL DEFAULT 'valid', -- valid / expired / expiring_soon / revoked
  last_reminder_at timestamptz,    -- pour ne pas spammer

  -- Métadonnées
  note            text,
  added_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CHECK (kind IN ('haccp', 'first_aid', 'fire_safety', 'languages', 'cash_register', 'security', 'forklift', 'allergens', 'gdpr', 'other')),
  CHECK (status IN ('valid', 'expired', 'expiring_soon', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_training_employee ON public.training_records(employee_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_training_expiring ON public.training_records(expires_at) WHERE status IN ('valid', 'expiring_soon');
CREATE INDEX IF NOT EXISTS idx_training_kind ON public.training_records(kind);

CREATE OR REPLACE FUNCTION public.touch_training_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  -- Auto-calcule status selon expires_at
  IF NEW.expires_at IS NOT NULL THEN
    IF NEW.expires_at < CURRENT_DATE THEN
      NEW.status = 'expired';
    ELSIF NEW.expires_at < CURRENT_DATE + INTERVAL '60 days' THEN
      NEW.status = 'expiring_soon';
    ELSE
      NEW.status = 'valid';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_training_touch ON public.training_records;
CREATE TRIGGER trg_training_touch BEFORE INSERT OR UPDATE ON public.training_records
FOR EACH ROW EXECUTE FUNCTION public.touch_training_updated_at();

ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_admin ON public.training_records;
CREATE POLICY training_admin ON public.training_records
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh','manager')));

DROP POLICY IF EXISTS training_own ON public.training_records;
CREATE POLICY training_own ON public.training_records
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE profile_id = auth.uid()));

-- Bucket pour PDFs/photos de certificats
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('training-certificates', 'training-certificates', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE public.training_records IS 'Formations + certifications employés avec expiration auto-calculée.';
