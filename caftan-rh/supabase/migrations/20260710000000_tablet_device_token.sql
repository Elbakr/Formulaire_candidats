-- Karim 2026-07-10 (Phase 3) : JETON D'APPAREIL pour l'accès tablette planning.
--
-- Le chemin public devinable /tablette est remplacé par un chemin OBSCUR
-- /t/<jeton> où <jeton> = jeton d'appareil long/aléatoire configuré par l'admin
-- dans /admin/settings. Sans le bon jeton, la route renvoie 404 (sauf admin
-- connecté qui garde l'accès pour la preview). But : limiter l'accès externe.
--
-- Ce jeton est une PREMIÈRE barrière (secret d'URL, installé sur la tablette du
-- magasin, non diffusé). Le CODE PERSONNEL du travailleur reste requis EN PLUS
-- (double barrière). Additif, nullable, idempotent.
alter table public.org_settings
  add column if not exists tablet_device_token text;

comment on column public.org_settings.tablet_device_token is
  'Jeton d''appareil (secret d''URL) pour l''accès tablette planning via /t/<jeton>. Généré/régénéré dans /admin/settings. NULL = aucun accès tablette public (sauf admin connecté).';
