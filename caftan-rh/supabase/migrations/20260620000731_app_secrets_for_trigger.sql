-- Karim 2026-06-09 : table de config pour les secrets utilisables depuis
-- des fonctions Postgres (triggers, RPC). Supabase managed bloque les GUCs
-- custom au niveau database/role (perms superuser requises), donc on
-- utilise une table app_secrets lue par les fonctions en SECURITY DEFINER.
--
-- Aucune RLS policy SELECT/UPDATE/DELETE = inaccessible aux clients (RLS
-- enforced). Seul le service_role bypass RLS, et il a deja CRON_SECRET
-- en env Vercel donc pas de surface d'attaque supplementaire.

create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz default now()
);
alter table public.app_secrets enable row level security;
-- Pas de policies : aucun acces hors service_role.

create or replace function public.touch_app_secrets() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_touch_app_secrets on public.app_secrets;
create trigger trg_touch_app_secrets before update on public.app_secrets
  for each row execute function public.touch_app_secrets();

-- Refactor de la fonction trigger notif-push : lit le secret depuis
-- public.app_secrets (avec security definer = bypass RLS).
create or replace function public.notify_push_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_url text;
  secret text;
  request_id bigint;
begin
  webhook_url := 'https://caftan-rh.vercel.app/api/internal/notif-push';

  select value into secret from public.app_secrets where key = 'cron_secret';
  if secret is null then secret := ''; end if;

  begin
    request_id := net.http_post(
      url := webhook_url,
      body := jsonb_build_object('notif_id', new.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'notify_push_after_insert net.http_post error: %', SQLERRM;
  end;

  return new;
end;
$$;

-- Trigger inchange mais recree par securite (idempotent).
drop trigger if exists trg_notify_push_after_insert on public.notifications;
create trigger trg_notify_push_after_insert
  after insert on public.notifications
  for each row execute function public.notify_push_after_insert();
