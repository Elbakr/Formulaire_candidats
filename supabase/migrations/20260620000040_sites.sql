-- Sites Caftan Factory — repris de l'ancien planning-employes.html.
--
-- 3 tables :
--   * `sites`            : 6 boutiques A..F + métadonnées (nom, ville, couleur)
--   * `site_needs`       : créneaux hebdomadaires d'effectif requis par site
--                          (jour 0..6, heure début/fin, nb vendeurs, rôle)
--   * `site_assignments` : affectation d'un employé à un site sur une période
--                          (utile pour vue par site et autoplan multi-site).
--
-- `shifts.site_id` (nullable) — FK introduite ici pour relier un shift à un
-- site sans casser l'existant (`shifts.location` reste utilisé en libre).
--
-- Idempotente.

create table if not exists sites (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,             -- 'A', 'B', ...
  name text not null,                    -- 'A Brabant'
  abbr text,
  city text,
  address text,
  color text,                            -- '#2d5be3' couleur primaire
  light_color text,                      -- '#eef1fd' couleur de fond claire
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_sites_code on sites (code);

create table if not exists site_needs (
  id uuid primary key default uuid_generate_v4(),
  site_id uuid not null references sites(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Dim..6=Sam
  start_time time not null,
  end_time time not null,
  headcount smallint not null default 1,
  role text,
  is_friday_morning boolean not null default false,
  is_friday_afternoon boolean not null default false,
  notes text,
  check (end_time > start_time)
);
create index if not exists idx_site_needs_site_dow on site_needs (site_id, day_of_week);

create table if not exists site_assignments (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  start_date date not null,
  end_date date,                         -- null = en cours
  is_primary boolean not null default false,
  pct smallint default 100,              -- répartition % (multi-site)
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_site_assignments_emp on site_assignments (employee_id);
create index if not exists idx_site_assignments_site on site_assignments (site_id);

alter table shifts add column if not exists site_id uuid references sites(id) on delete set null;
create index if not exists idx_shifts_site on shifts (site_id);

alter table sites             enable row level security;
alter table site_needs        enable row level security;
alter table site_assignments  enable row level security;

drop policy if exists sites_read           on sites;
drop policy if exists sites_admin          on sites;
drop policy if exists site_needs_read      on site_needs;
drop policy if exists site_needs_admin     on site_needs;
drop policy if exists site_assign_read     on site_assignments;
drop policy if exists site_assign_admin    on site_assignments;

create policy sites_read         on sites            for select using (true);
create policy sites_admin        on sites            for all    using (is_rh()) with check (is_rh());
create policy site_needs_read    on site_needs       for select using (true);
create policy site_needs_admin   on site_needs       for all    using (is_rh()) with check (is_rh());
create policy site_assign_read   on site_assignments for select using (is_manager());
create policy site_assign_admin  on site_assignments for all    using (is_rh()) with check (is_rh());

do $$ begin
  begin alter publication supabase_realtime add table sites;            exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table site_needs;       exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table site_assignments; exception when duplicate_object then null; end;
end $$;
