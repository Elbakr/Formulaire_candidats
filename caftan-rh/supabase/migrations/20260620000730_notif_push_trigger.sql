-- Karim 2026-06-09 : trigger Postgres qui declenche automatiquement un push
-- web (VAPID) apres chaque INSERT dans public.notifications.
--
-- Probleme constate : 6868 lignes dans notifications, 2 subscriptions actives,
-- mais push_subscriptions.last_used_at = null partout -> AUCUN push jamais
-- envoye. Cause : les 22+ call sites qui INSERT dans notifications oublient
-- d'appeler sendPushToProfile() apres. Au lieu de modifier 22 fichiers (risque
-- d'oubli futur), on attache le push a l'INSERT au niveau DB via trigger.
--
-- Flux : INSERT notification -> trigger -> net.http_post async fire-and-forget
-- vers https://caftan-rh.vercel.app/api/internal/notif-push -> endpoint lit la
-- notif et appelle sendPushToProfile(recipient_id, {title, body, link}).
--
-- Secret d'auth : lu depuis le GUC `app.cron_secret` (defini par
-- alter database postgres set app.cron_secret = '...' execute apres cette
-- migration). Si absent, le trigger envoie quand meme mais l'endpoint
-- rejettera 401 -> log warning sans casser l'INSERT.

create extension if not exists pg_net with schema extensions;

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
  -- URL fixe : alias permanent Vercel prod. Si change, modifier ici et
  -- redeployer cette migration via `apply-migration.mjs` (idempotent).
  webhook_url := 'https://caftan-rh.vercel.app/api/internal/notif-push';

  -- Secret lu depuis GUC. Defini hors migration via :
  --   alter database postgres set app.cron_secret = '...'
  begin
    secret := current_setting('app.cron_secret', true);
  exception when others then
    secret := null;
  end;

  -- Fire-and-forget HTTP POST async (pg_net non-bloquant).
  -- Le body contient juste l'ID, l'endpoint relit la notif depuis DB.
  begin
    request_id := net.http_post(
      url := webhook_url,
      body := jsonb_build_object('notif_id', new.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(secret, '')
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    -- Best-effort : log mais ne JAMAIS faire echouer l'INSERT notification.
    raise warning 'notify_push_after_insert net.http_post error: %', SQLERRM;
  end;

  return new;
end;
$$;

-- Recreate trigger idempotent
drop trigger if exists trg_notify_push_after_insert on public.notifications;
create trigger trg_notify_push_after_insert
  after insert on public.notifications
  for each row execute function public.notify_push_after_insert();

-- Sanity check : la fonction est marquee SECURITY DEFINER avec owner postgres,
-- donc elle bypass RLS pour lire les settings et faire le HTTP call. Aucune
-- donnee sensible n'est exposee (juste l'UUID de la notification).
