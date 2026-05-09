-- Activity log / audit trail
-- Tracks key actor actions (status changes, notes, shifts, time-off decisions, evaluations, employee updates).
-- Triggers honor `current_setting('caftan.skip_audit', true) = 'on'` for batch operations.

create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references profiles(id) on delete set null,
  actor_label text,
  kind text not null,
  target_type text,
  target_id uuid,
  description text,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_target on activity_log (target_type, target_id, created_at desc);
create index if not exists idx_activity_recent on activity_log (created_at desc);

alter table activity_log enable row level security;

drop policy if exists activity_rh_read on activity_log;
create policy activity_rh_read on activity_log for select using (is_manager());

drop policy if exists activity_anyone_insert on activity_log;
create policy activity_anyone_insert on activity_log for insert with check (true);

-- Helper : current actor name (snapshot)
create or replace function _activity_actor_name(actor uuid) returns text as $$
  select full_name from profiles where id = actor;
$$ language sql stable security definer set search_path = public;

-- Skip helper
create or replace function _activity_skip() returns boolean as $$
  select coalesce(current_setting('caftan.skip_audit', true), '') = 'on';
$$ language sql stable;

-- Generic snapshot stripping ephemeral fields
create or replace function _activity_snapshot(rec jsonb) returns jsonb as $$
  select rec - 'created_at' - 'updated_at';
$$ language sql immutable;

------------------------------------------------------------------
-- applications: status change + insert
------------------------------------------------------------------
create or replace function log_application_status_changed() returns trigger as $$
declare actor uuid; actor_name text;
begin
  if _activity_skip() then return new; end if;
  if new.status is distinct from old.status then
    actor := auth.uid();
    actor_name := _activity_actor_name(actor);
    insert into activity_log (actor_id, actor_label, kind, target_type, target_id, description, data)
    values (
      actor, actor_name,
      'application.status_changed',
      'application',
      new.id,
      format('Statut candidature %s -> %s', coalesce(old.status::text, '?'), new.status::text),
      jsonb_build_object(
        'from', old.status::text,
        'to', new.status::text,
        'application_id', new.id,
        'candidate_id', new.candidate_id
      )
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_log_application_status on applications;
create trigger trg_log_application_status
  after update of status on applications
  for each row execute function log_application_status_changed();

create or replace function log_application_created() returns trigger as $$
declare actor uuid; actor_name text;
begin
  if _activity_skip() then return new; end if;
  actor := auth.uid();
  actor_name := _activity_actor_name(actor);
  insert into activity_log (actor_id, actor_label, kind, target_type, target_id, description, data)
  values (
    actor, actor_name,
    'application.created',
    'application',
    new.id,
    format('Nouvelle candidature %s', new.id::text),
    _activity_snapshot(to_jsonb(new))
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_log_application_created on applications;
create trigger trg_log_application_created
  after insert on applications
  for each row execute function log_application_created();

------------------------------------------------------------------
-- notes: insert
------------------------------------------------------------------
create or replace function log_note_added() returns trigger as $$
declare actor uuid; actor_name text;
begin
  if _activity_skip() then return new; end if;
  actor := coalesce(new.author_id, auth.uid());
  actor_name := _activity_actor_name(actor);
  insert into activity_log (actor_id, actor_label, kind, target_type, target_id, description, data)
  values (
    actor, actor_name,
    'note.added',
    'application',
    new.application_id,
    format('Note ajoutée (%s)', case when new.is_private then 'privée' else 'publique' end),
    jsonb_build_object(
      'note_id', new.id,
      'application_id', new.application_id,
      'is_private', new.is_private,
      'preview', left(new.body, 200)
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_log_note_added on notes;
create trigger trg_log_note_added
  after insert on notes
  for each row execute function log_note_added();

------------------------------------------------------------------
-- shifts: insert + update
------------------------------------------------------------------
create or replace function log_shift_created() returns trigger as $$
declare actor uuid; actor_name text;
begin
  if _activity_skip() then return new; end if;
  actor := coalesce(new.created_by, auth.uid());
  actor_name := _activity_actor_name(actor);
  insert into activity_log (actor_id, actor_label, kind, target_type, target_id, description, data)
  values (
    actor, actor_name,
    'shift.created',
    'shift',
    new.id,
    format('Shift créé pour le %s (%s-%s)', new.date::text, new.start_time::text, new.end_time::text),
    _activity_snapshot(to_jsonb(new))
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_log_shift_created on shifts;
create trigger trg_log_shift_created
  after insert on shifts
  for each row execute function log_shift_created();

create or replace function log_shift_updated() returns trigger as $$
declare actor uuid; actor_name text;
begin
  if _activity_skip() then return new; end if;
  -- only log meaningful changes
  if old.date is not distinct from new.date
     and old.start_time is not distinct from new.start_time
     and old.end_time is not distinct from new.end_time
     and old.status is not distinct from new.status
     and old.position is not distinct from new.position
     and old.location is not distinct from new.location
     and old.break_minutes is not distinct from new.break_minutes
     and old.notes is not distinct from new.notes
  then
    return new;
  end if;
  actor := auth.uid();
  actor_name := _activity_actor_name(actor);
  insert into activity_log (actor_id, actor_label, kind, target_type, target_id, description, data)
  values (
    actor, actor_name,
    'shift.updated',
    'shift',
    new.id,
    format('Shift modifié (%s)', new.date::text),
    jsonb_build_object(
      'before', _activity_snapshot(to_jsonb(old)),
      'after', _activity_snapshot(to_jsonb(new))
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_log_shift_updated on shifts;
create trigger trg_log_shift_updated
  after update on shifts
  for each row execute function log_shift_updated();

------------------------------------------------------------------
-- time_off_requests: decision (approved/rejected)
------------------------------------------------------------------
create or replace function log_time_off_decided() returns trigger as $$
declare actor uuid; actor_name text;
begin
  if _activity_skip() then return new; end if;
  if new.status is distinct from old.status
     and new.status in ('approved','rejected') then
    actor := coalesce(new.decided_by, auth.uid());
    actor_name := _activity_actor_name(actor);
    insert into activity_log (actor_id, actor_label, kind, target_type, target_id, description, data)
    values (
      actor, actor_name,
      'time_off.decided',
      'time_off',
      new.id,
      format('Congé %s (%s -> %s)', new.status::text, new.start_date::text, new.end_date::text),
      jsonb_build_object(
        'time_off_id', new.id,
        'employee_id', new.employee_id,
        'kind', new.kind::text,
        'start_date', new.start_date,
        'end_date', new.end_date,
        'status', new.status::text
      )
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_log_time_off_decided on time_off_requests;
create trigger trg_log_time_off_decided
  after update of status on time_off_requests
  for each row execute function log_time_off_decided();

------------------------------------------------------------------
-- evaluations: insert
------------------------------------------------------------------
create or replace function log_evaluation_created() returns trigger as $$
declare actor uuid; actor_name text;
begin
  if _activity_skip() then return new; end if;
  actor := coalesce(new.evaluator_id, auth.uid());
  actor_name := _activity_actor_name(actor);
  insert into activity_log (actor_id, actor_label, kind, target_type, target_id, description, data)
  values (
    actor, actor_name,
    'evaluation.created',
    'evaluation',
    new.id,
    format('Évaluation enregistrée (note %s)', coalesce(new.total::text, '-')),
    jsonb_build_object(
      'evaluation_id', new.id,
      'employee_id', new.employee_id,
      'period_start', new.period_start,
      'period_end', new.period_end,
      'total', new.total
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_log_evaluation_created on evaluations;
create trigger trg_log_evaluation_created
  after insert on evaluations
  for each row execute function log_evaluation_created();

------------------------------------------------------------------
-- employees: update (any meaningful change)
------------------------------------------------------------------
create or replace function log_employee_updated() returns trigger as $$
declare actor uuid; actor_name text;
begin
  if _activity_skip() then return new; end if;
  -- skip if only updated_at changed
  if _activity_snapshot(to_jsonb(old)) = _activity_snapshot(to_jsonb(new)) then
    return new;
  end if;
  actor := auth.uid();
  actor_name := _activity_actor_name(actor);
  insert into activity_log (actor_id, actor_label, kind, target_type, target_id, description, data)
  values (
    actor, actor_name,
    'employee.updated',
    'employee',
    new.id,
    format('Fiche employé modifiée: %s', new.full_name),
    jsonb_build_object(
      'before', _activity_snapshot(to_jsonb(old)),
      'after', _activity_snapshot(to_jsonb(new))
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_log_employee_updated on employees;
create trigger trg_log_employee_updated
  after update on employees
  for each row execute function log_employee_updated();

-- Realtime
do $$ begin
  perform 1
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log';
  if not found then
    execute 'alter publication supabase_realtime add table activity_log';
  end if;
end $$;
