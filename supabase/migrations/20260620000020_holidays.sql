-- Vague 6 — Jours fériés Belgique + vacances scolaires + fermetures spécifiques boutique
--
-- 3 tables :
--   * `holidays`         : jours fériés (légaux BE + autres) — date unique. Récurrence calculée à
--                          la volée (les fériés "fixes" sont reseedés chaque année par
--                          scripts/seed-holidays.mjs ; Pâques / Pentecôte / Ascension sont
--                          calculés dynamiquement dans `caftan-rh/src/lib/holidays/be.ts`).
--   * `school_breaks`    : périodes de vacances scolaires (range start_date..end_date)
--   * `company_closures` : fermetures boutique spécifiques (formation, inventaire, événement)
--                          potentiellement liées à un département (sinon = toute l'organisation).
--
-- RLS :
--   - `holidays` / `school_breaks` : lecture publique (info utilitaire) ; écriture RH/admin.
--   - `company_closures`           : lecture manager+, écriture RH/admin.
--
-- Idempotente : tout est DDL, sécurisé `if not exists` pour les éléments ajoutés à chaud.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'holiday_kind') then
    create type holiday_kind as enum ('legal','school_break','company_closure','event_other');
  end if;
end $$;

create table if not exists holidays (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  label text not null,
  kind holiday_kind not null default 'legal',
  country text default 'BE',
  region text,           -- ex: 'BE-BRU' / 'BE-FLA' / 'BE-WAL' / null = pays entier
  recurring_yearly boolean default true,
  is_active boolean default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (date, label, country)
);
create index if not exists idx_holidays_date on holidays (date);

-- Vacances scolaires (range)
create table if not exists school_breaks (
  id uuid primary key default uuid_generate_v4(),
  label text not null,
  start_date date not null,
  end_date date not null,
  region text default 'BE-BRU',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_school_breaks_range on school_breaks (start_date, end_date);

-- Fermetures boutique spécifiques (formation, inventaire, événement…)
create table if not exists company_closures (
  id uuid primary key default uuid_generate_v4(),
  label text not null,
  start_date date not null,
  end_date date not null,
  department_id uuid references departments(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  check (end_date >= start_date)
);
create index if not exists idx_closures_range on company_closures (start_date, end_date);
create index if not exists idx_closures_dept on company_closures (department_id);

alter table holidays         enable row level security;
alter table school_breaks    enable row level security;
alter table company_closures enable row level security;

-- Drop / re-create policies idempotently
drop policy if exists holidays_read         on holidays;
drop policy if exists holidays_admin        on holidays;
drop policy if exists school_breaks_read    on school_breaks;
drop policy if exists school_breaks_admin   on school_breaks;
drop policy if exists closures_read         on company_closures;
drop policy if exists closures_rh_write     on company_closures;

create policy holidays_read       on holidays         for select using (true);
create policy holidays_admin      on holidays         for all    using (is_rh()) with check (is_rh());
create policy school_breaks_read  on school_breaks    for select using (true);
create policy school_breaks_admin on school_breaks    for all    using (is_rh()) with check (is_rh());
create policy closures_read       on company_closures for select using (is_manager());
create policy closures_rh_write   on company_closures for all    using (is_rh()) with check (is_rh());

-- Realtime — guarder pour idempotence
do $$ begin
  begin
    alter publication supabase_realtime add table holidays;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table school_breaks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table company_closures;
  exception when duplicate_object then null;
  end;
end $$;
