-- Karim 2026-06-02 : audit log des corrections manuelles sur clock_entries.
-- Permet de tracer qui a modifié quoi, quand, avec ancienne/nouvelle valeur.

CREATE TABLE IF NOT EXISTS public.clock_entry_corrections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   timestamptz NOT NULL DEFAULT now(),

  -- Cible
  employee_id   uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_entry_id uuid REFERENCES public.clock_entries(id) ON DELETE SET NULL,

  -- Action
  action        text NOT NULL,  -- 'create_manual', 'edit_occurred_at', 'edit_kind', 'edit_site', 'delete', 'mark_rest_day'

  -- Snapshots
  before_value  jsonb,
  after_value   jsonb,

  -- Acteur
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name    text,

  -- Contexte
  reason        text,           -- justification de la correction (ex: "Tuya sync raté, vérifié avec employee")
  target_date   date,           -- date concernée (pour requêtes par jour)

  CHECK (action IN ('create_manual', 'edit_occurred_at', 'edit_kind', 'edit_site', 'delete', 'mark_rest_day'))
);

CREATE INDEX IF NOT EXISTS idx_corr_employee_date ON public.clock_entry_corrections(employee_id, target_date DESC);
CREATE INDEX IF NOT EXISTS idx_corr_entry ON public.clock_entry_corrections(clock_entry_id);
CREATE INDEX IF NOT EXISTS idx_corr_occurred ON public.clock_entry_corrections(occurred_at DESC);

-- RLS : admin/rh read all, employee read own
ALTER TABLE public.clock_entry_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corr_admin_read ON public.clock_entry_corrections;
CREATE POLICY corr_admin_read ON public.clock_entry_corrections
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh','manager')));

DROP POLICY IF EXISTS corr_employee_read_own ON public.clock_entry_corrections;
CREATE POLICY corr_employee_read_own ON public.clock_entry_corrections
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE profile_id = auth.uid()));

-- Marqueur "jour de repos explicite" sur clock_entries (pour qu'un jour vide
-- ne soit pas confondu avec un trou de pointage).
-- Karim 2026-06-02 : on utilise un kind dédié = 'rest_day' (sans occurred_at IN/OUT)
-- via la table existante. Verifions/etendons le check si besoin :
DO $$
DECLARE
  has_constraint boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE '%clock_entries%kind%'
  ) INTO has_constraint;
  -- Si check existant n'autorise pas rest_day, on l'etend (sans casser donnees)
  IF has_constraint THEN
    BEGIN
      ALTER TABLE public.clock_entries DROP CONSTRAINT IF EXISTS clock_entries_kind_check;
      ALTER TABLE public.clock_entries ADD CONSTRAINT clock_entries_kind_check
        CHECK (kind IN ('in','out','rest_day'));
    EXCEPTION WHEN OTHERS THEN
      -- ignore si schema different
      NULL;
    END;
  END IF;
END $$;

COMMENT ON TABLE public.clock_entry_corrections IS
  'Journal des corrections manuelles sur clock_entries (admin/RH).';
