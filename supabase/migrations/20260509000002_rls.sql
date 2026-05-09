-- Row Level Security policies par rôle

create or replace function current_app_role() returns app_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function is_admin() returns boolean as $$
  select coalesce(current_app_role() = 'admin', false);
$$ language sql stable;

create or replace function is_rh() returns boolean as $$
  select coalesce(current_app_role() in ('admin','rh'), false);
$$ language sql stable;

create or replace function is_manager() returns boolean as $$
  select coalesce(current_app_role() in ('admin','rh','manager'), false);
$$ language sql stable;

alter table profiles enable row level security;
alter table departments enable row level security;
alter table jobs enable row level security;
alter table candidates enable row level security;
alter table applications enable row level security;
alter table interviews enable row level security;
alter table notes enable row level security;
alter table messages enable row level security;
alter table documents enable row level security;

create policy profiles_self_read on profiles for select
  using (auth.uid() = id or is_manager());
create policy profiles_self_update on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id and role = (select role from profiles where id = auth.uid()));
create policy profiles_admin_all on profiles for all
  using (is_admin()) with check (is_admin());

create policy departments_read_all on departments for select using (true);
create policy departments_admin_write on departments for all
  using (is_admin()) with check (is_admin());

create policy jobs_public_read on jobs for select using (is_open or is_manager());
create policy jobs_rh_write on jobs for all using (is_rh()) with check (is_rh());

create policy candidates_self_read on candidates for select
  using (profile_id = auth.uid() or is_manager());
create policy candidates_self_update on candidates for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy candidates_rh_write on candidates for all using (is_rh()) with check (is_rh());

create policy applications_self_read on applications for select
  using (
    exists (select 1 from candidates c where c.id = candidate_id and c.profile_id = auth.uid())
    or assigned_manager = auth.uid()
    or is_rh()
  );
create policy applications_rh_write on applications for all using (is_rh()) with check (is_rh());
create policy applications_manager_update on applications for update
  using (assigned_manager = auth.uid()) with check (assigned_manager = auth.uid());

create policy interviews_read on interviews for select
  using (
    is_manager()
    or exists (
      select 1 from applications a join candidates c on c.id = a.candidate_id
      where a.id = application_id and c.profile_id = auth.uid()
    )
  );
create policy interviews_manager_write on interviews for all using (is_manager()) with check (is_manager());

create policy notes_read on notes for select
  using (
    is_manager()
    or (
      not is_private
      and exists (
        select 1 from applications a join candidates c on c.id = a.candidate_id
        where a.id = application_id and c.profile_id = auth.uid()
      )
    )
  );
create policy notes_manager_write on notes for all using (is_manager()) with check (is_manager());

create policy messages_read on messages for select
  using (
    is_manager()
    or exists (
      select 1 from applications a join candidates c on c.id = a.candidate_id
      where a.id = application_id and c.profile_id = auth.uid()
    )
  );
create policy messages_rh_write on messages for all using (is_rh()) with check (is_rh());

create policy documents_read on documents for select
  using (
    is_manager()
    or uploaded_by = auth.uid()
    or exists (
      select 1 from applications a join candidates c on c.id = a.candidate_id
      where a.id = application_id and c.profile_id = auth.uid()
    )
  );
create policy documents_write on documents for insert
  with check (
    is_rh()
    or exists (
      select 1 from applications a join candidates c on c.id = a.candidate_id
      where a.id = application_id and c.profile_id = auth.uid()
    )
  );
create policy documents_rh_delete on documents for delete using (is_rh());
