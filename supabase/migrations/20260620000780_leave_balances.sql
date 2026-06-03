-- Karim 2026-06-03 : soldes congés payés par employé / année.
-- Régime belge : 20 jours ouvrables/an plein temps régime 5j/sem (prorata
-- par contrat type + temps partiel + ancienneté année N-1).
-- Sectoriels (CCT 201 commerce alimentaire) : potentiellement +1-2j (à
-- définir par admin via leave-rules existante).

CREATE TABLE IF NOT EXISTS public.leave_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year            int NOT NULL,                    -- 2026, 2027, etc.

  -- Allocation
  base_days       numeric(5, 2) NOT NULL DEFAULT 20.00,  -- 20 j légal plein temps
  sector_extra    numeric(5, 2) NOT NULL DEFAULT 0.00,   -- CCT sectorielles
  carry_over      numeric(5, 2) NOT NULL DEFAULT 0.00,   -- reporté de N-1 (rare BE)
  prorata_factor  numeric(5, 4) NOT NULL DEFAULT 1.0000, -- 0..1 selon contrat (temps partiel, mi-année, etc.)
  total_allocated numeric(5, 2) GENERATED ALWAYS AS (
    (base_days + sector_extra + carry_over) * prorata_factor
  ) STORED,

  -- Conso
  used_days       numeric(5, 2) NOT NULL DEFAULT 0.00,   -- déjà pris + validé
  pending_days    numeric(5, 2) NOT NULL DEFAULT 0.00,   -- demandé mais pas encore validé
  remaining_days  numeric(5, 2) GENERATED ALWAYS AS (
    GREATEST(0, ((base_days + sector_extra + carry_over) * prorata_factor) - used_days - pending_days)
  ) STORED,

  -- Métadonnées
  computed_at     timestamptz NOT NULL DEFAULT now(),
  computation_note text,
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balance_employee ON public.leave_balances(employee_id, year);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_leave_balances_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_leave_balance_touch ON public.leave_balances;
CREATE TRIGGER trg_leave_balance_touch BEFORE UPDATE ON public.leave_balances
FOR EACH ROW EXECUTE FUNCTION public.touch_leave_balances_updated_at();

-- RLS
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lb_admin_all ON public.leave_balances;
CREATE POLICY lb_admin_all ON public.leave_balances
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh','manager')));

DROP POLICY IF EXISTS lb_employee_own ON public.leave_balances;
CREATE POLICY lb_employee_own ON public.leave_balances
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE profile_id = auth.uid()));

COMMENT ON TABLE public.leave_balances IS
  'Soldes congés payés par employé / année (calcul prorata BE legal).';
