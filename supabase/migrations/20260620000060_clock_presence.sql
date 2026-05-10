-- Pointage par site & présence live + intégration chat.
--
-- Étend la table existante `clock_entries` (kind 'in'/'out' + occurred_at) avec :
--   * site_id            : FK vers sites (nullable mais fortement recommandé)
--   * entry_method       : 'tap' | 'qr' | 'auto_shift' | 'manager_override'
--   * geo_lat/lng/accuracy_m
--   * is_anomalous       : flag pour la cron d'anomalies
--   * notes              : déjà présent ; on garde
--
-- Ajoute :
--   * vue `clock_currently_in`  : qui est clocké-in en ce moment (pas de out après)
--   * vue `clock_sessions`      : pair (in,out) avec durée (utile pour historique)
--   * trigger `prevent_double_clock_in`  : empêche 2 clock-ins ouverts pour 1 employé
--   * trigger `prevent_clock_out_without_in` : empêche un clock-out sans in préalable
--
-- Idempotente.

-- 1) Colonnes additives (no-op si déjà là)
alter table clock_entries
  add column if not exists site_id uuid references sites(id) on delete set null,
  add column if not exists entry_method text not null default 'tap',
  add column if not exists geo_lat double precision,
  add column if not exists geo_lng double precision,
  add column if not exists geo_accuracy_m double precision,
  add column if not exists is_anomalous boolean not null default false;

-- Vérification soft sur entry_method (sans casser l'existant).
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clock_entries_entry_method_check'
  ) then
    alter table clock_entries
      add constraint clock_entries_entry_method_check
      check (entry_method in ('tap','qr','auto_shift','manager_override','web','mobile','manual_admin'));
  end if;
end $$;

create index if not exists idx_clock_entries_site on clock_entries (site_id, occurred_at desc);
create index if not exists idx_clock_entries_anomalous on clock_entries (is_anomalous) where is_anomalous = true;

-- 2) Vue "qui est clocké-in en ce moment"
--    Logique : pour chaque employé, prendre la dernière entrée ; si kind='in' → présent.
create or replace view clock_currently_in as
with last_entry as (
  select distinct on (employee_id)
    employee_id,
    id,
    kind,
    occurred_at,
    site_id,
    shift_id,
    entry_method
  from clock_entries
  order by employee_id, occurred_at desc
)
select
  le.employee_id,
  le.id            as last_entry_id,
  le.occurred_at   as clock_in_at,
  le.site_id,
  le.shift_id,
  le.entry_method,
  e.full_name,
  e.profile_id,
  s.code           as site_code,
  s.name           as site_name,
  s.color          as site_color,
  s.light_color    as site_light_color
from last_entry le
join employees e on e.id = le.employee_id
left join sites s on s.id = le.site_id
where le.kind = 'in';

-- 3) Vue "sessions" — paire chaque IN avec le OUT suivant pour le même employé.
create or replace view clock_sessions as
with ordered as (
  select
    id, employee_id, kind, occurred_at, site_id, shift_id, entry_method,
    lead(kind)        over (partition by employee_id order by occurred_at) as next_kind,
    lead(occurred_at) over (partition by employee_id order by occurred_at) as next_at,
    lead(id)          over (partition by employee_id order by occurred_at) as next_id
  from clock_entries
)
select
  o.id              as in_entry_id,
  case when o.next_kind = 'out' then o.next_id end as out_entry_id,
  o.employee_id,
  o.site_id,
  o.shift_id,
  o.entry_method,
  o.occurred_at     as clock_in_at,
  case when o.next_kind = 'out' then o.next_at end  as clock_out_at,
  case when o.next_kind = 'out'
       then extract(epoch from (o.next_at - o.occurred_at)) / 60.0
  end              as duration_minutes
from ordered o
where o.kind = 'in';

-- 4) Trigger — empêche un double clock-in ouvert pour le même employé.
create or replace function trg_prevent_double_clock_in() returns trigger as $$
declare
  last_kind clock_kind;
begin
  if new.kind = 'in' then
    select kind into last_kind
    from clock_entries
    where employee_id = new.employee_id
      and (new.id is null or id <> new.id)
      and occurred_at <= coalesce(new.occurred_at, now())
    order by occurred_at desc
    limit 1;
    if last_kind = 'in' then
      raise exception 'Un clock-in est déjà ouvert pour cet employé.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.kind = 'out' then
    select kind into last_kind
    from clock_entries
    where employee_id = new.employee_id
      and (new.id is null or id <> new.id)
      and occurred_at <= coalesce(new.occurred_at, now())
    order by occurred_at desc
    limit 1;
    if last_kind is null or last_kind <> 'in' then
      raise exception 'Aucun clock-in ouvert : impossible de clock-out.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists tg_prevent_double_clock_in on clock_entries;
create trigger tg_prevent_double_clock_in
  before insert on clock_entries
  for each row execute function trg_prevent_double_clock_in();

-- 5) RLS update — la policy existante (`clock_admin_correct`) couvre déjà UPDATE par RH.
--    On ajoute aussi la possibilité pour managers d'override (insert/update) si pas déjà.
drop policy if exists clock_manager_override on clock_entries;
create policy clock_manager_override on clock_entries
  for all
  using (is_manager())
  with check (is_manager());

-- 6) Realtime (déjà ajouté sur clock_entries dans 20260509000012, mais idempotent).
do $$ begin
  begin alter publication supabase_realtime add table clock_entries; exception when duplicate_object then null; end;
end $$;

-- Notify PostgREST to reload schema (en best-effort)
notify pgrst, 'reload schema';
