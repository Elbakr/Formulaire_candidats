-- Karim 2026-07-11 : kill-switch admin du cron hebdomadaire de génération des
-- plannings (Phase 2). Par défaut ACTIVÉ ; l'admin peut le désactiver à tout
-- moment depuis les Réglages. Le bouton manuel « Générer plannings (tous) » reste
-- disponible indépendamment de ce flag.

alter table public.org_settings
  add column if not exists planning_weekly_autogen_enabled boolean not null default true;
