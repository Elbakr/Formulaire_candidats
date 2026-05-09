-- Sequences / flows automatisés : workflow déclenché par le changement de statut d'une candidature.

create type seq_step_kind as enum ('email','notification','note','wait','set_status');
create type seq_run_status as enum ('active','done','cancelled');
create type seq_step_status as enum ('pending','done','skipped','failed');

create table sequences (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  description text,
  trigger_status text, -- application.status qui déclenche. NULL = manuel uniquement.
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sequence_steps (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  position integer not null,
  kind seq_step_kind not null,
  delay_days integer default 0,
  -- payloads dépendent du kind :
  email_template_slug text,
  email_subject_override text,
  email_custom_message text,
  notification_target text default 'rh', -- rh | manager | candidate
  notification_title text,
  notification_body text,
  note_body text,
  set_status_to text, -- application_status cible
  unique (sequence_id, position)
);

create table sequence_runs (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  triggered_by uuid references profiles(id) on delete set null,
  status seq_run_status not null default 'active',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index idx_seq_runs_app on sequence_runs (application_id);

create table sequence_run_steps (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references sequence_runs(id) on delete cascade,
  step_id uuid references sequence_steps(id) on delete set null,
  position integer not null,
  kind seq_step_kind not null,
  fire_at timestamptz not null,
  status seq_step_status not null default 'pending',
  result jsonb,
  -- snapshot du payload au moment de la création du run :
  payload jsonb,
  fired_at timestamptz,
  unique (run_id, position)
);
create index idx_seq_run_steps_due on sequence_run_steps (fire_at) where status = 'pending';

alter table sequences enable row level security;
alter table sequence_steps enable row level security;
alter table sequence_runs enable row level security;
alter table sequence_run_steps enable row level security;

create policy seq_read on sequences for select using (is_manager());
create policy seq_rh_write on sequences for all using (is_rh()) with check (is_rh());
create policy seqstp_read on sequence_steps for select using (is_manager());
create policy seqstp_rh_write on sequence_steps for all using (is_rh()) with check (is_rh());
create policy seqrun_read on sequence_runs for select using (is_manager());
create policy seqrun_rh_write on sequence_runs for all using (is_rh()) with check (is_rh());
create policy seqstprun_read on sequence_run_steps for select using (is_manager());
create policy seqstprun_rh_write on sequence_run_steps for all using (is_rh()) with check (is_rh());

alter publication supabase_realtime add table sequence_runs;
alter publication supabase_realtime add table sequence_run_steps;

-- Trigger : quand applications.status change, lance les sequences dont trigger_status = new.status
create or replace function trg_sequence_on_status_change() returns trigger as $$
declare s record; new_run uuid;
begin
  if new.status is distinct from old.status then
    for s in select id from sequences where trigger_status = new.status::text and is_active = true loop
      -- évite les doublons : pas de second run actif sur la même séquence/candidature
      if not exists (
        select 1 from sequence_runs r
        where r.sequence_id = s.id and r.application_id = new.id and r.status = 'active'
      ) then
        insert into sequence_runs (sequence_id, application_id) values (s.id, new.id) returning id into new_run;
        insert into sequence_run_steps (run_id, step_id, position, kind, fire_at, status, payload)
        select new_run, st.id, st.position, st.kind, now() + (st.delay_days || ' days')::interval, 'pending',
               to_jsonb(st)
        from sequence_steps st where st.sequence_id = s.id order by st.position;
      end if;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger seq_status_change after update on applications
  for each row execute function trg_sequence_on_status_change();

create trigger trg_sequences_upd before update on sequences
  for each row execute function set_updated_at();
