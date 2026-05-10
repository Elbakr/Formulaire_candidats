-- Module 4 — Géofence stricte pour le pointage clock-in.
--
-- Rayon en mètres par site (override par boutique ; défaut 100m).
-- Toggle global `clock_geofence_strict` :
--   * true  → refus du clock-in si hors rayon ou géoloc absente.
--   * false → géoloc capturée mais non bloquante (mode actuel),
--             tag is_anomalous=true si hors rayon.
--
-- Idempotente.

alter table sites
  add column if not exists geofence_radius_m int default 100
    check (geofence_radius_m is null or geofence_radius_m > 0);

alter table org_settings
  add column if not exists clock_geofence_strict boolean default true;

-- Backfill défensif : tout site sans rayon explicite → 100m.
update sites set geofence_radius_m = 100 where geofence_radius_m is null;

notify pgrst, 'reload schema';
