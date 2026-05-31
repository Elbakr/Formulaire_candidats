-- Karim 2026-05-31 : expiration 1h après début shift + auto-annulation si comblé

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

create or replace function public.cancel_redundant_reinforcement_requests()
returns trigger as $$
begin
  if new.status not in ('accepted', 'completed') or new.status = old.status then
    return new;
  end if;
  update public.reinforcement_requests as r
  set
    status = 'cancelled_filled',
    cancelled_at = now(),
    cancellation_reason = 'Besoin comblé par ' ||
      coalesce((select e.full_name from public.employees e where e.id = new.proposed_employee_id), 'un autre travailleur'),
    responded_at = coalesce(responded_at, now())
  where r.id <> new.id and r.site_id = new.site_id and r.date = new.date
    and r.status = 'sent_to_employee'
    and (r.start_time, r.end_time) overlaps (new.start_time, new.end_time);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cancel_redundant_reinforcement on public.reinforcement_requests;
create trigger trg_cancel_redundant_reinforcement
  after update of status on public.reinforcement_requests
  for each row execute function public.cancel_redundant_reinforcement_requests();

create or replace function public.cancel_reinforcement_on_shift_create()
returns trigger as $$
begin
  update public.reinforcement_requests as r
  set status='cancelled_filled', cancelled_at=now(),
    cancellation_reason='Besoin comblé par création shift',
    responded_at=coalesce(responded_at, now())
  where r.site_id = new.site_id and r.date = new.date
    and r.status = 'sent_to_employee'
    and (r.start_time, r.end_time) overlaps (new.start_time, new.end_time);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cancel_reinforcement_on_shift on public.shifts;
create trigger trg_cancel_reinforcement_on_shift
  after insert on public.shifts
  for each row execute function public.cancel_reinforcement_on_shift_create();
