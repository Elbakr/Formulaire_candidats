-- Phase "patron-autonomous" : champs admin candidat/employé + clock + notifications + reminders

-- 1) Admin data candidat (en plus des champs existants)
alter table candidates
  add column if not exists cin_number text,
  add column if not exists nationality text,
  add column if not exists birth_place text,
  add column if not exists iban text,
  add column if not exists bic text,
  add column if not exists bank_holder text,
  add column if not exists transport_type text,
  add column if not exists transport_subscription text,
  add column if not exists transport_price text,
  add column if not exists distance_km integer,
  add column if not exists langs jsonb default '{}'::jsonb,
  add column if not exists wanted_contract_type text,
  add column if not exists work_time_pref text,
  add column if not exists available_from date,
  add column if not exists planned_unavailability text,
  add column if not exists admin_score integer default 0;

-- 2) Admin data employé
alter table employees
  add column if not exists cin_number text,
  add column if not exists iban text,
  add column if not exists bic text,
  add column if not exists bank_holder text,
  add column if not exists transport_type text,
  add column if not exists transport_price text,
  add column if not exists nrn text,
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists trial_end_date date,
  add column if not exists annual_hours_budget integer,
  add column if not exists notes_admin text;

-- 3) Time clock / pointage
create type clock_kind as enum ('in', 'out');

create table clock_entries (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  shift_id uuid references shifts(id) on delete set null,
  kind clock_kind not null,
  occurred_at timestamptz not null default now(),
  source text default 'web', -- web|mobile|manual_admin
  ip text,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_clock_employee on clock_entries (employee_id, occurred_at desc);
create index idx_clock_shift on clock_entries (shift_id);

alter table clock_entries enable row level security;
create policy clock_self_read on clock_entries for select
  using (
    is_manager()
    or exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
  );
create policy clock_self_write on clock_entries for insert
  with check (
    is_manager()
    or exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
  );
create policy clock_admin_correct on clock_entries for update using (is_rh()) with check (is_rh());
alter publication supabase_realtime add table clock_entries;

-- 4) Notifications
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  kind text not null,         -- 'application_new' | 'time_off_pending' | 'status_changed' | 'reminder' | etc.
  title text not null,
  body text,
  link text,                  -- relative URL to open
  data jsonb,                 -- payload pour usage UI
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notif_recipient_read on notifications (recipient_id, read_at);
create index idx_notif_recent on notifications (recipient_id, created_at desc);

alter table notifications enable row level security;
create policy notif_self_read on notifications for select using (recipient_id = auth.uid());
create policy notif_self_update on notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notif_admin_create on notifications for insert with check (is_rh() or recipient_id = auth.uid());
alter publication supabase_realtime add table notifications;

-- Helper pour écrire une notification depuis SQL/triggers
create or replace function notify_user(
  recipient uuid,
  kind text,
  title text,
  body text default null,
  link text default null,
  data jsonb default null
) returns uuid as $$
declare nid uuid;
begin
  insert into notifications (recipient_id, kind, title, body, link, data)
  values (recipient, kind, title, body, link, data)
  returning id into nid;
  return nid;
end;
$$ language plpgsql security definer set search_path = public;

-- Trigger : notif RH quand une nouvelle candidature arrive
create or replace function trg_notif_new_application() returns trigger as $$
declare rh_user uuid;
begin
  for rh_user in select id from profiles where role in ('admin','rh') loop
    perform notify_user(
      rh_user,
      'application_new',
      'Nouvelle candidature',
      'Une nouvelle candidature vient d''arriver.',
      '/rh/candidates/' || new.id::text,
      jsonb_build_object('application_id', new.id)
    );
  end loop;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_application_created
  after insert on applications
  for each row execute function trg_notif_new_application();

-- Trigger : notif manager quand une demande de congé arrive
create or replace function trg_notif_time_off() returns trigger as $$
declare emp_manager uuid; rh_user uuid;
begin
  if new.status = 'pending' then
    select manager_id into emp_manager from employees where id = new.employee_id;
    if emp_manager is not null then
      perform notify_user(
        emp_manager,
        'time_off_pending',
        'Demande de congé',
        format('%s a fait une demande de congé du %s au %s',
          (select full_name from employees where id = new.employee_id),
          new.start_date::text, new.end_date::text),
        '/planning/time-off',
        jsonb_build_object('time_off_id', new.id)
      );
    end if;
    -- Notify all RH/admin too
    for rh_user in select id from profiles where role in ('admin','rh') loop
      perform notify_user(
        rh_user, 'time_off_pending', 'Demande de congé',
        format('%s a fait une demande de congé',
          (select full_name from employees where id = new.employee_id)),
        '/planning/time-off',
        jsonb_build_object('time_off_id', new.id)
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_time_off_created
  after insert on time_off_requests
  for each row execute function trg_notif_time_off();

-- Trigger : notif candidat quand son application change de statut (s'il a un compte)
create or replace function trg_notif_status_change() returns trigger as $$
declare cand_profile uuid;
begin
  if new.status is distinct from old.status then
    select c.profile_id into cand_profile
    from candidates c where c.id = new.candidate_id;
    if cand_profile is not null then
      perform notify_user(
        cand_profile, 'status_changed', 'Statut de candidature mis à jour',
        format('Ta candidature est passée à : %s', new.status::text),
        '/me',
        jsonb_build_object('application_id', new.id, 'status', new.status::text)
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_application_status
  after update on applications
  for each row execute function trg_notif_status_change();

-- 5) Reminders : table légère pour les rappels en attente
create table reminders (
  id uuid primary key default uuid_generate_v4(),
  kind text not null,                 -- 'trial_end' | 'work_anniversary' | 'student_quota' | 'cdd_end' | etc.
  employee_id uuid references employees(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  fire_at date not null,
  fired_at timestamptz,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index idx_reminders_due on reminders (fire_at) where fired_at is null;

alter table reminders enable row level security;
create policy reminders_rh_all on reminders for all using (is_rh()) with check (is_rh());
