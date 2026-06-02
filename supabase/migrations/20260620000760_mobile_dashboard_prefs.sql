-- Karim 2026-06-02 : preferences dashboard mobile /m par user.
-- jsonb { widgets: [{id, enabled, order}], default: bool }

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mobile_dashboard_prefs jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.mobile_dashboard_prefs IS
  'Layout perso /m mobile dashboard. Format {widgets:[{id,enabled,order}]}.';
