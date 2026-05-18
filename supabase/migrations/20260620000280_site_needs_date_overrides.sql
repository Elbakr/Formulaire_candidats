-- Karim 17/05 : surcharge ponctuelle des besoins par DATE specifique.
-- Cas d usage : jour ferie exceptionnel (Aid, Pentecote rush), evenement
-- (vente flash, soldes), meteo extreme (canicule -> moins de monde),
-- visite VIP. L override prend le pas sur site_needs (jour de semaine).
--
-- Si une ligne override existe pour (site_id, date), elle REMPLACE TOUS
-- les besoins de site_needs pour ce site sur cette date. Sinon, fallback
-- sur site_needs (day_of_week).
--
-- Le champ headcount peut etre 0 pour FERMER le site exceptionnellement
-- ce jour-la sans toucher au reste.

create table if not exists site_needs_date_overrides (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  headcount integer not null check (headcount >= 0),
  role text,
  is_critical integer not null default 0 check (is_critical between 0 and 2),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (site_id, date, start_time, end_time)
);

create index if not exists idx_sndo_site_date
  on site_needs_date_overrides(site_id, date);

comment on table site_needs_date_overrides is
  'Surcharge ponctuelle des besoins par DATE. Prend le pas sur site_needs.day_of_week. Si >=1 row existe pour (site_id, date), c est exclusivement ces overrides qui sont utilises pour ce jour, sinon fallback sur site_needs.';
comment on column site_needs_date_overrides.headcount is
  'Nombre exact d employes attendus. 0 = ferme exceptionnellement ce jour-la.';
comment on column site_needs_date_overrides.is_critical is
  '0=normal, 1=critique, 2=ultra-critique. Memes semantiques que site_needs.is_critical.';
comment on column site_needs_date_overrides.note is
  'Texte libre pour expliquer pourquoi cet override (ex : "Aid 2026 rush boutique").';

alter table site_needs_date_overrides enable row level security;
create policy sndo_manager_all on site_needs_date_overrides
  using (is_manager())
  with check (is_manager());
