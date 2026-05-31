-- Karim 2026-05-30 : fix reset password -> role 'candidate'. Preserve le role
-- existant + auto-set admin pour les emails de la table admin_emails.

create table if not exists public.admin_emails (
  email text primary key,
  added_at timestamptz default now(),
  added_by text,
  note text
);

insert into public.admin_emails (email, note) values
  ('elbazikarim@gmail.com', 'Patron - admin permanent'),
  ('hr@caftanfactory.com', 'Compte HR partage')
on conflict (email) do nothing;

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
    role = case
      when is_admin_email and public.profiles.role = 'candidate' then 'admin'
      else public.profiles.role
    end;
  return new;
end;
$$ language plpgsql security definer;
