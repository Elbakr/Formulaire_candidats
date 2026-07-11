-- Karim 2026-07-11 : mode AUTO-SHIFT (tablette).
--
-- Au lieu d'afficher le VARIANT coché par défaut, la tablette affiche le planning
-- RÉEL du travailleur (table `shifts`) sur 3 semaines, jour en cours surligné.
--
--  * employees.auto_shift : Auto-Shift INDIVIDUEL (immédiat).
--  * org_settings.auto_shift_global_effective_at : Auto-Shift GLOBAL (tous).
--      NULL           -> désactivé
--      > now()        -> PROGRAMMÉ (fenêtre de 10 min avant bascule, annulable)
--      <= now()       -> ACTIF (tous les travailleurs en Auto-Shift)
--    La bascule effective se lit à la volée (aucun cron) : global actif ssi
--    effective_at IS NOT NULL AND effective_at <= now().

alter table public.employees
  add column if not exists auto_shift boolean not null default false;

alter table public.org_settings
  add column if not exists auto_shift_global_effective_at timestamptz;
