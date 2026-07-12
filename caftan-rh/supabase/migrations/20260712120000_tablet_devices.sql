-- Karim 2026-07-12 : PLUSIEURS tablettes planning (une par magasin : A..G), chacune
-- avec un JETON UNIQUE (/t/<jeton>). Remplace le jeton unique
-- org_settings.tablet_device_token (conservé pour compat de la tablette A déjà
-- installée). Chaque tablette s'installe en web-app (PWA) sur SON appareil ; le lien
-- reste secret et propre à cette tablette.

create table if not exists public.tablet_devices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,        -- 'A'..'G' (identifiant de la tablette / magasin)
  label text,                       -- libellé optionnel (ex. « Molenbeek »)
  token text not null unique,       -- secret d'URL (base64url ~43 chars)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Index de résolution rapide côté /t/<jeton>.
create index if not exists tablet_devices_token_idx on public.tablet_devices (token) where active;
