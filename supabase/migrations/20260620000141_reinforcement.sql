-- Demandes de renfort : un manager déclare un besoin, le système liste des
-- employés candidats triés par proximité + heures restantes, le manager envoie
-- une proposition en 1 clic, l'employé accepte ou décline.
--
-- États :
--   open               -> créée, pas encore proposée
--   sent_to_employee   -> proposée, en attente de réponse
--   accepted           -> employé accepte (alias de covered une fois shift créé)
--   declined           -> employé refuse → manager peut proposer à un autre
--   covered            -> shift créé, demande terminée
--   cancelled          -> annulée par le manager
--   expired            -> proposition non répondue dans le délai (4h par défaut)
--
-- Idempotente.

create table if not exists reinforcement_requests (
  id uuid primary key default uuid_generate_v4(),
  requester_profile_id uuid references profiles(id) on delete set null,
  site_id uuid not null references sites(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  position text,
  notes text,
  status text not null default 'open',
  proposed_employee_id uuid references employees(id) on delete set null,
  proposed_at timestamptz,
  responded_at timestamptz,
  resulting_shift_id uuid references shifts(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_reinf_status_date on reinforcement_requests (status, date);
create index if not exists idx_reinf_proposed_emp on reinforcement_requests (proposed_employee_id);
create index if not exists idx_reinf_site_date on reinforcement_requests (site_id, date);

alter table reinforcement_requests enable row level security;
drop policy if exists rr_admin_all on reinforcement_requests;
drop policy if exists rr_manager_write on reinforcement_requests;
drop policy if exists rr_proposed_emp on reinforcement_requests;
drop policy if exists rr_proposed_emp_update on reinforcement_requests;

create policy rr_admin_all on reinforcement_requests for all
  using (is_rh()) with check (is_rh());
create policy rr_manager_write on reinforcement_requests for all
  using (is_manager()) with check (is_manager());
create policy rr_proposed_emp on reinforcement_requests for select using (
  exists(
    select 1 from employees e
    where e.id = proposed_employee_id and e.profile_id = auth.uid()
  )
);
create policy rr_proposed_emp_update on reinforcement_requests for update
  using (
    exists(
      select 1 from employees e
      where e.id = proposed_employee_id and e.profile_id = auth.uid()
    )
  )
  with check (
    exists(
      select 1 from employees e
      where e.id = proposed_employee_id and e.profile_id = auth.uid()
    )
  );

do $$ begin
  begin alter publication supabase_realtime add table reinforcement_requests; exception when duplicate_object then null; end;
end $$;
