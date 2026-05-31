-- Karim 2026-05-31 : règles d'expiration et annulation auto des demandes de
-- renfort envoyées aux travailleurs (reinforcement_requests).
--
-- RÈGLE A — expiration au plus tard 1h après début shift :
--   le cron /api/cron/reinforcement-expire utilise cette borne en plus
--   de expires_at. La logique cron est mise à jour côté Node.
--
-- RÈGLE B — annulation auto quand un autre travailleur valide le même besoin :
--   trigger BD qui s'active quand une request passe à 'accepted'
--   OU qu'un shift est créé pour le créneau. Il annule toutes les autres
--   requests pending pour MÊME site + MÊME date + créneau qui chevauche,
--   avec status='cancelled_filled' + cancellation_reason.

-- Ajoute la colonne cancellation_reason si manquante
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reinforcement_requests'
    and column_name = 'cancellation_reason'
  ) then
    alter table public.reinforcement_requests add column cancellation_reason text;
    alter table public.reinforcement_requests add column cancelled_at timestamptz;
  end if;
end $$;

-- Fonction : annule les requests pending pour un même besoin si comblé
create or replace function public.cancel_redundant_reinforcement_requests()
returns trigger as $$
declare
  conflict_count int;
begin
  -- Ne déclencher que quand le status passe à 'accepted' ou shift créé
  if new.status not in ('accepted', 'completed') then
    return new;
  end if;
  if new.status = old.status then
    return new;
  end if;

  -- Annule toutes les autres requests pending pour MÊME site + MÊME date +
  -- créneau qui chevauche (overlap horaire).
  update public.reinforcement_requests as r
  set
    status = 'cancelled_filled',
    cancelled_at = now(),
    cancellation_reason =
      'Besoin comblé par ' ||
      coalesce(
        (select e.full_name from public.employees e where e.id = new.proposed_employee_id),
        'un autre travailleur'
      ) ||
      ' (request ' || left(new.id::text, 8) || ')',
    responded_at = coalesce(responded_at, now())
  where r.id <> new.id
    and r.site_id = new.site_id
    and r.date = new.date
    and r.status = 'sent_to_employee'
    and (
      -- chevauchement horaire
      (r.start_time, r.end_time) overlaps (new.start_time, new.end_time)
    );

  get diagnostics conflict_count = row_count;
  if conflict_count > 0 then
    raise notice 'cancel_redundant_reinforcement_requests: % requests annulées suite à acceptation de %', conflict_count, new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cancel_redundant_reinforcement on public.reinforcement_requests;
create trigger trg_cancel_redundant_reinforcement
  after update of status on public.reinforcement_requests
  for each row
  execute function public.cancel_redundant_reinforcement_requests();

-- Aussi : quand un shift est créé pour un créneau qui correspond à un besoin
-- en attente, annule les requests pending pour ce besoin.
create or replace function public.cancel_reinforcement_on_shift_create()
returns trigger as $$
begin
  update public.reinforcement_requests as r
  set
    status = 'cancelled_filled',
    cancelled_at = now(),
    cancellation_reason =
      'Besoin comblé par création shift (employee ' || left(coalesce(new.employee_id::text, '?'), 8) || ')',
    responded_at = coalesce(responded_at, now())
  where r.site_id = new.site_id
    and r.date = new.date
    and r.status = 'sent_to_employee'
    and (
      (r.start_time, r.end_time) overlaps (new.start_time, new.end_time)
    );
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cancel_reinforcement_on_shift on public.shifts;
create trigger trg_cancel_reinforcement_on_shift
  after insert on public.shifts
  for each row
  execute function public.cancel_reinforcement_on_shift_create();
