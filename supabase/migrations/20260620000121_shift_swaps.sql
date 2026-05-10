-- Shift swaps — échange / couverture de shifts entre employés
--
-- target_shift_id null = "demande de couverture" (le target prend le shift,
-- pas d'échange). target_shift_id non null = swap (échange réciproque).
--
-- Idempotente.

create table if not exists shift_swap_requests (
  id uuid primary key default uuid_generate_v4(),
  requester_employee_id uuid not null references employees(id) on delete cascade,
  requester_shift_id uuid not null references shifts(id) on delete cascade,
  target_employee_id uuid references employees(id) on delete set null,
  target_shift_id uuid references shifts(id) on delete set null,
  status text not null default 'pending',
  -- 'pending' | 'accepted' | 'rejected' | 'auto_validated' | 'cancelled' | 'manager_approved' | 'manager_rejected'
  reason text,
  auto_validated boolean default false,
  auto_validation_check jsonb,
  needs_manager_review boolean not null default false,
  manager_review_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles(id) on delete set null
);
create index if not exists idx_swaps_requester on shift_swap_requests (requester_employee_id, status);
create index if not exists idx_swaps_target on shift_swap_requests (target_employee_id, status);
create index if not exists idx_swaps_status on shift_swap_requests (status, created_at desc);

alter table shift_swap_requests enable row level security;

drop policy if exists ssr_self_read on shift_swap_requests;
drop policy if exists ssr_self_create on shift_swap_requests;
drop policy if exists ssr_self_update on shift_swap_requests;
drop policy if exists ssr_target_update on shift_swap_requests;
drop policy if exists ssr_admin_all on shift_swap_requests;
drop policy if exists ssr_manager_read on shift_swap_requests;

create policy ssr_self_read on shift_swap_requests for select using (
  exists (
    select 1 from employees e
    where (e.id = requester_employee_id or e.id = target_employee_id)
      and e.profile_id = auth.uid()
  )
);

create policy ssr_self_create on shift_swap_requests for insert with check (
  exists (
    select 1 from employees e
    where e.id = requester_employee_id and e.profile_id = auth.uid()
  )
);

-- Le requester peut UPDATE pour annuler sa propre demande.
create policy ssr_self_update on shift_swap_requests for update using (
  exists (
    select 1 from employees e
    where e.id = requester_employee_id and e.profile_id = auth.uid()
  )
);

-- Le target peut UPDATE pour accepter/refuser.
create policy ssr_target_update on shift_swap_requests for update using (
  exists (
    select 1 from employees e
    where e.id = target_employee_id and e.profile_id = auth.uid()
  )
);

create policy ssr_manager_read on shift_swap_requests for select using (is_manager());

create policy ssr_admin_all on shift_swap_requests for all using (is_rh()) with check (is_rh());

do $$ begin
  begin alter publication supabase_realtime add table shift_swap_requests; exception when duplicate_object then null; end;
end $$;
