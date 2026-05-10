-- Unplanned absences — signalement employé d'une absence imprévue,
-- avec déclenchement de la procédure de remplacement (V1 : crée un
-- message dans le chat du site_group).
--
-- Idempotente.

create table if not exists unplanned_absences (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  shift_id uuid references shifts(id) on delete set null,
  date date not null,
  reason text not null,
  -- 'sick' | 'family_emergency' | 'transport' | 'other'
  justification_url text,
  status text not null default 'reported',
  -- 'reported' | 'covered' | 'unfilled' | 'resolved'
  replacement_employee_id uuid references employees(id) on delete set null,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  notes text,
  chat_message_id uuid references chat_messages(id) on delete set null
);
create index if not exists idx_absences_status on unplanned_absences (status, date);
create index if not exists idx_absences_emp on unplanned_absences (employee_id, date desc);
create index if not exists idx_absences_shift on unplanned_absences (shift_id);

alter table unplanned_absences enable row level security;

drop policy if exists ua_self on unplanned_absences;
drop policy if exists ua_self_volunteer_update on unplanned_absences;
drop policy if exists ua_manager on unplanned_absences;
drop policy if exists ua_admin on unplanned_absences;

-- L'employé concerné peut tout faire sur ses propres absences.
create policy ua_self on unplanned_absences for all using (
  exists (
    select 1 from employees e
    where e.id = employee_id and e.profile_id = auth.uid()
  )
) with check (
  exists (
    select 1 from employees e
    where e.id = employee_id and e.profile_id = auth.uid()
  )
);

-- Manager : lecture seule (vue admin/absences).
create policy ua_manager on unplanned_absences for select using (is_manager());

-- RH/admin : tout droit.
create policy ua_admin on unplanned_absences for all using (is_rh()) with check (is_rh());

do $$ begin
  begin alter publication supabase_realtime add table unplanned_absences; exception when duplicate_object then null; end;
end $$;
