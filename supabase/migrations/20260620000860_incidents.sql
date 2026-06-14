-- Karim 2026-06-14 : agent d'astreinte auto-réparateur (incrément 1).
--
-- Table `incidents` : un incident = une panne système détectée (signature
-- stable). L'agent d'astreinte (/api/cron/incident-manager) ouvre un incident,
-- tente une réparation automatique (playbook), puis le résout ou l'escalade.
--
-- Déduplication : au plus UN incident `open` par signature (index unique
-- partiel). Tant qu'il est open, on incrémente `occurrences` au lieu de
-- re-notifier -> pas de re-bombardement de la même panne.
--
-- Idempotente.

create table if not exists public.incidents (
  id           uuid primary key default gen_random_uuid(),
  signature    text not null,                       -- clé stable de la panne (ex: 'tuya_ingestion_stalled')
  source       text not null default 'system_health',
  severity     text not null default 'warning',     -- critical | warning | info
  title        text,
  problem      text,
  status       text not null default 'open',        -- open | resolved
  occurrences  integer not null default 1,          -- nb de détections tant qu'open
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  resolved_at  timestamptz,
  repair_model text,                                -- playbook/modèle ayant résolu (ex: 'playbook:retrigger_tuya_poll')
  last_error   text,
  attempts     jsonb not null default '[]'::jsonb,  -- journal des tentatives de réparation
  resolution   jsonb,                               -- { cause, solution, prevention } à la clôture
  created_at   timestamptz not null default now()
);

-- Soft check sur status (sans casser l'existant).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_status_check') then
    alter table public.incidents
      add constraint incidents_status_check check (status in ('open', 'resolved'));
  end if;
end $$;

-- Dédup : un seul incident OUVERT par signature.
create unique index if not exists uniq_incidents_open_signature
  on public.incidents (signature) where status = 'open';

create index if not exists idx_incidents_status_lastseen
  on public.incidents (status, last_seen desc);

-- RLS : lecture réservée admin/rh ; les écritures passent par le service-role
-- (cron incident-manager) qui bypasse RLS.
alter table public.incidents enable row level security;

drop policy if exists incidents_admin_read on public.incidents;
create policy incidents_admin_read on public.incidents
  for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'rh')
  ));

notify pgrst, 'reload schema';
