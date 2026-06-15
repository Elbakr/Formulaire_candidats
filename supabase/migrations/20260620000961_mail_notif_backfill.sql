-- Karim 2026-06-15 : backfill — les notifs « mail reçu » déjà créées pointaient
-- vers '/me' (générique). On les redirige vers le mail précis dans /me/mails,
-- en utilisant data->>'source_id' (l'id du outbound_mails posé par le trigger).

update public.notifications
set link = '/me/mails#mail-' || (data->>'source_id')
where kind = 'mail_received'
  and (link is null or link = '/me')
  and data ? 'source_id'
  and coalesce(data->>'source_id', '') <> '';
