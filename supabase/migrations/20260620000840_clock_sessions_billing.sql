-- Karim 2026-06-10 : vue de DÉCOMPTE des heures avec Tuya comme source de vérité.
--
-- Règle métier (validée) : le badge biométrique Tuya fait foi pour compter le
-- temps de présence. Les pointages web/selfie/géofence COEXISTENT (fallback +
-- futurs sites sans badgeuse), mais quand un employé a des taps Tuya un jour
-- donné, on ne compte QUE le Tuya ce jour-là. Les jours sans aucun Tuya
-- retombent sur les pointages web/auto.
--
-- ADDITIVE : ne touche PAS la vue `clock_sessions` (conservée pour l'affichage
-- brut / historique multi-sources). Cette vue-ci sert au décompte facturable /
-- KPI heures.
--
-- Le bucket "jour" est calculé en UTC pour rester cohérent avec la logique
-- d'alternance de tuya-poll.ts (`occurredAt.slice(0,10)` = date UTC).
--
-- Idempotente.

create or replace view clock_sessions_billing as
with day_has_tuya as (
  -- pour chaque employé × jour : existe-t-il au moins une entrée Tuya ?
  select
    employee_id,
    (occurred_at at time zone 'UTC')::date as work_date
  from clock_entries
  where source = 'tuya'
  group by 1, 2
),
authoritative as (
  -- garde, par employé × jour :
  --   * jour AVEC du Tuya   -> tout SAUF le self-service web (qui ferait doublon
  --                            avec le badge). On conserve donc tuya + auto_close
  --                            (fermetures auto des sessions oubliées) +
  --                            manual_admin (corrections RH), qui ne sont PAS des
  --                            doublons mais font partie du flux Tuya.
  --   * jour SANS aucun Tuya -> toutes les entrées (web / auto / manuel).
  select ce.*
  from clock_entries ce
  left join day_has_tuya dt
    on dt.employee_id = ce.employee_id
   and dt.work_date = (ce.occurred_at at time zone 'UTC')::date
  where dt.employee_id is null
     or coalesce(ce.source, '') <> all (array['web', 'selfie', 'geofence', 'mobile', 'manual'])
),
ordered as (
  select
    id, employee_id, kind, occurred_at, site_id, shift_id, entry_method, source,
    lead(kind)        over w as next_kind,
    lead(occurred_at) over w as next_at,
    lead(id)          over w as next_id
  from authoritative
  window w as (partition by employee_id order by occurred_at)
)
select
  o.id              as in_entry_id,
  case when o.next_kind = 'out' then o.next_id end as out_entry_id,
  o.employee_id,
  o.site_id,
  o.shift_id,
  o.entry_method,
  o.source,
  o.occurred_at     as clock_in_at,
  case when o.next_kind = 'out' then o.next_at end as clock_out_at,
  case when o.next_kind = 'out'
       then extract(epoch from (o.next_at - o.occurred_at)) / 60.0
  end               as duration_minutes
from ordered o
where o.kind = 'in';

notify pgrst, 'reload schema';
