-- Karim 2026-05-30 : fix bug recurrent ou le reset password ramene a 'candidate'.
-- Le trigger handle_new_user() s execute sur tout INSERT auth.users et FORCE
-- role='candidate' meme si un profile pre-existant en avait un autre.
--
-- Fix :
-- 1. Si un profile existe deja pour cet id -> preserve son role (ON CONFLICT)
-- 2. Pour les emails admin connus -> auto-set role='admin' a la creation
-- 3. Table admin_emails maintenue pour ajouter/retirer des admins sans modif code

create table if not exists public.admin_emails (
  email text primary key,
  added_at timestamptz default now(),
  added_by text,
  note text
);

-- Seed les emails admin actuels
insert into public.admin_emails (email, note) values
  ('elbazikarim@gmail.com', 'Patron - admin permanent'),
  ('hr@caftanfactory.com', 'Compte HR partage')
on conflict (email) do nothing;

-- Patch du trigger
create or replace function public.handle_new_user() returns trigger as $$
declare
  is_admin_email boolean;
begin
  select exists(select 1 from public.admin_emails where email = new.email) into is_admin_email;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when is_admin_email then 'admin' else 'candidate' end
  )
  on conflict (id) do update set
    email = excluded.email,
    -- Karim 2026-05-30 : on PRESERVE le role existant (ne pas ecraser).
    -- Si l email est admin et que le role est tombe a candidate, on remonte.
    role = case
      when is_admin_email and public.profiles.role = 'candidate' then 'admin'
      else public.profiles.role
    end;
  return new;
end;
$$ language plpgsql security definer;
