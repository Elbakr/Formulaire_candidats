-- Karim 2026-07-04 : journal des CONNEXIONS candidat pour ANTI-FRAUDE.
-- Base légale = intérêt légitime (art. 6(1)(f) RGPD) : prévention des candidatures
-- frauduleuses / multi-comptes (concurrents, usurpation). Minimisation stricte :
-- IP, horodatage, géoloc APPROXIMATIVE (pays/ville via headers Vercel, sans API),
-- type d'appareil (user-agent) + empreinte LÉGÈRE (hash UA+langue). AUCUN
-- fingerprint invasif. Rétention 24 mois (purge auto). Consultation ADMIN only.
create table if not exists public.candidate_access_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  candidate_id uuid references public.candidates(id) on delete cascade,
  context text not null,            -- 'postuler' | 'contract_info' | 'candidate_portal'
  token text,
  ip text,
  ip_country text,
  ip_region text,
  ip_city text,
  user_agent text,
  device_hint text,
  accept_language text,
  ua_fingerprint text
);
create index if not exists idx_cal_candidate on public.candidate_access_logs(candidate_id);
create index if not exists idx_cal_ip on public.candidate_access_logs(ip);
create index if not exists idx_cal_fp on public.candidate_access_logs(ua_fingerprint);
create index if not exists idx_cal_created on public.candidate_access_logs(created_at desc);
-- RLS activée SANS policy => deny-all pour anon/authenticated ; seul le service-role
-- (createAdminClient, après requireRole['admin']) lit/écrit.
alter table public.candidate_access_logs enable row level security;
