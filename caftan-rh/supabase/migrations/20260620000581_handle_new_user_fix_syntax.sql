-- Karim 2026-05-30 : fix syntaxe handle_new_user (precedent crashait INSERT auth.users)

create or replace function public.handle_new_user() returns trigger as $$
declare
  is_admin_email boolean;
  existing_role text;
begin
  select exists(select 1 from public.admin_emails where lower(email) = lower(new.email))
    into is_admin_email;
  select role::text into existing_role from public.profiles where id = new.id;

  if existing_role is null then
    insert into public.profiles (id, email, full_name, role)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      (case when is_admin_email then 'admin' else 'candidate' end)::user_role
    )
    on conflict (id) do nothing;
  elsif is_admin_email and existing_role = 'candidate' then
    update public.profiles set role = 'admin', email = new.email where id = new.id;
  end if;
  return new;
exception when others then
  raise warning 'handle_new_user error for %: %', new.email, sqlerrm;
  return new;
end;
$$ language plpgsql security definer;
