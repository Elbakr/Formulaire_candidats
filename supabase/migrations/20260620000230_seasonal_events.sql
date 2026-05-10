-- Seasonal events (saisonnalités événementielles).
--
-- Capture les fenêtres calendaires qui font varier l'effectif requis :
--   - peak  : pic d'activité (Soldes, Aïd, Noël, ...) → multiplier > 1
--   - low   : période creuse (Ramadan jour, rentrée septembre) → multiplier < 1
--   - closed: fermeture totale (rare ici, distinct des company_closures
--             départementales — celui-ci sert juste à informer le solver +
--             page /today qu'on est explicitement en pause activité).
--
-- Lecture publique (toute l'org), écriture RH/admin uniquement.
-- Idempotent.

create table if not exists seasonal_events (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  kind text not null check (kind in ('peak', 'low', 'closed')),
  start_date date not null,
  end_date date not null,
  staff_multiplier numeric(3,2) default 1.0,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_seasonal_events_window
  on seasonal_events (start_date, end_date)
  where is_active is true;

alter table seasonal_events enable row level security;

drop policy if exists se_read on seasonal_events;
drop policy if exists se_admin on seasonal_events;
create policy se_read on seasonal_events for select using (true);
create policy se_admin on seasonal_events for all using (is_rh()) with check (is_rh());

do $$ begin
  begin alter publication supabase_realtime add table seasonal_events; exception when duplicate_object then null; end;
end $$;
