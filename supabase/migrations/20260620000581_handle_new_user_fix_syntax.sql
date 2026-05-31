-- Karim 2026-05-30 : fix syntaxe du trigger handle_new_user.
-- Le precedent avait "public.profiles.role" dans ON CONFLICT DO UPDATE qui
-- causait "Database error creating new user". On split en 2 étapes claires :
-- 1. INSERT ... ON CONFLICT DO NOTHING (cree si absent, sinon laisse)
-- 2. UPDATE separe si admin_email + role tombe a 'candidate'

create or replace function public.handle_new_user() returns trigger as $$
declare
  is_admin_email boolean;
  existing_role text;
begin
  select exists(select 1 from public.admin_emails where lower(email) = lower(new.email))
    into is_admin_email;
  select role::text into existing_role from public.profiles where id = new.id;

  if existing_role is null then
    -- Profile absent -> creer avec role admin si email admin, sinon candidate
    insert into public.profiles (id, email, full_name, role)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      (case when is_admin_email then 'admin' else 'candidate' end)::user_role
    )
    on conflict (id) do nothing;
  elsif is_admin_email and existing_role = 'candidate' then
    -- Profile existe, role tombe a candidate alors qu il devrait etre admin
    update public.profiles set role = 'admin', email = new.email where id = new.id;
  end if;
  return new;
exception when others then
  -- En cas d erreur quelconque, ne pas bloquer la creation de l auth.user
  raise warning 'handle_new_user error for %: %', new.email, sqlerrm;
  return new;
end;
$$ language plpgsql security definer;
