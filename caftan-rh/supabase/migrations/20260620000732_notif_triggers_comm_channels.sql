-- Karim 2026-06-09 : triggers PG qui creent automatiquement une notification
-- pour chaque envoi sur les canaux de communication. Couvre Phase 1 (mails
-- sortants) + Phase 2 (chat messages). Le trigger existant
-- `trg_notify_push_after_insert` sur public.notifications se charge ensuite
-- du push web (VAPID via /api/internal/notif-push).
--
-- Decision Karim : ne JAMAIS modifier le code applicatif pour ajouter ces
-- notifs (risque d'oubli au prochain ajout). Centraliser via triggers DB.
-- Tout futur INSERT dans outbound_mails ou chat_messages declenche la notif.
--
-- Format unifie (brief Karim) :
--   title : "{sender} t'a envoye un {channel_label}"
--           - sender = nom humain du profile_id si dispo, sinon "Le systeme"
--           - channel_label = "mail" / "message" / etc.
--   body  : "{subject_ou_objet} - {LEFT(content, 100)}..."
--   link  : URL contextuelle pour aller lire
--   kind  : identifiant court par type (mail_received, chat_message)
--   data  : jsonb avec source_id pour back-link DB
--
-- Garde-fous :
--   - Skip si pas de profile_id resolu (destinataire externe sans compte)
--   - Skip si auteur == destinataire (eviter auto-notif)
--   - Skip si status='failed' (mail pas parti)
--   - Skip si source est dans public.notification_mute_sources (escape hatch
--     pour reduire le bruit sans toucher au code)

-- ============================================================================
-- 1. Table de mute par source
-- ============================================================================
create table if not exists public.notification_mute_sources (
  source text primary key,
  reason text,
  muted_by uuid references public.profiles(id) on delete set null,
  muted_at timestamptz default now()
);
alter table public.notification_mute_sources enable row level security;
-- Pas de policy : seul service_role bypass = lecture/ecriture admin only

-- ============================================================================
-- 2. Helper : resolve_recipient_profile()
-- ============================================================================
-- Renvoie le profile_id du destinataire d'un mail outbound, en cherchant
-- successivement : (a) employee.profile_id si employee_id non-null,
-- (b) candidate.profile_id si candidate_id non-null, (c) match exact
-- profiles.email = lower(recipient_email).
create or replace function public.resolve_recipient_profile(
  p_employee_id uuid,
  p_candidate_id uuid,
  p_recipient_email text
) returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if p_employee_id is not null then
    select e.profile_id into v_profile_id
    from public.employees e
    where e.id = p_employee_id;
    if v_profile_id is not null then return v_profile_id; end if;
  end if;

  if p_candidate_id is not null then
    select c.profile_id into v_profile_id
    from public.candidates c
    where c.id = p_candidate_id;
    if v_profile_id is not null then return v_profile_id; end if;
  end if;

  if p_recipient_email is not null and length(trim(p_recipient_email)) > 0 then
    select p.id into v_profile_id
    from public.profiles p
    where lower(p.email) = lower(trim(p_recipient_email))
    limit 1;
    if v_profile_id is not null then return v_profile_id; end if;
  end if;

  return null;
end;
$$;

-- ============================================================================
-- 3. Helper : resolve_sender_label()
-- ============================================================================
-- Renvoie le libelle humain de l'expediteur, dans l'ordre :
-- (a) full_name du sender_profile_id si non-null
-- (b) p_fallback_sender_name si non-vide
-- (c) "Le systeme" en derniere instance
create or replace function public.resolve_sender_label(
  p_sender_profile_id uuid,
  p_fallback_sender_name text
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  if p_sender_profile_id is not null then
    select coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''))
      into v_label
      from public.profiles p
      where p.id = p_sender_profile_id;
    if v_label is not null then return v_label; end if;
  end if;

  if p_fallback_sender_name is not null and length(trim(p_fallback_sender_name)) > 0 then
    return trim(p_fallback_sender_name);
  end if;

  return 'Le systeme';
end;
$$;

-- ============================================================================
-- 4. Trigger sur outbound_mails -> notification au destinataire
-- ============================================================================
create or replace function public.notify_recipient_on_outbound_mail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_profile_id uuid;
  v_sender_label text;
  v_excerpt text;
  v_title text;
  v_body text;
  v_muted boolean;
begin
  -- Skip si l'envoi a echoue (mail pas parti)
  if new.status is distinct from 'sent' and new.status is not null then
    return new;
  end if;

  -- Skip si source mutee
  select exists(select 1 from public.notification_mute_sources where source = new.source)
    into v_muted;
  if v_muted then return new; end if;

  -- Resolve destinataire
  v_recipient_profile_id := public.resolve_recipient_profile(
    new.employee_id, new.candidate_id, new.recipient_email
  );
  if v_recipient_profile_id is null then
    -- Destinataire externe sans compte : pas de notif possible
    return new;
  end if;

  -- Eviter auto-notification si l'expediteur est aussi le destinataire
  if new.sender_profile_id is not null
     and new.sender_profile_id = v_recipient_profile_id then
    return new;
  end if;

  -- Construit le libelle expediteur
  v_sender_label := public.resolve_sender_label(new.sender_profile_id, new.sender_name);

  -- Extrait court : 100 premiers chars du body (text plain prefere)
  v_excerpt := coalesce(
    nullif(trim(left(regexp_replace(new.body, '\s+', ' ', 'g'), 100)), ''),
    nullif(trim(left(regexp_replace(coalesce(new.body_html, ''), '<[^>]+>', ' ', 'g'), 100)), ''),
    ''
  );
  if length(v_excerpt) >= 100 then
    v_excerpt := v_excerpt || '...';
  end if;

  v_title := v_sender_label || ' t''a envoye un mail';
  if v_excerpt = '' then
    v_body := new.subject;
  else
    v_body := new.subject || ' - ' || v_excerpt;
  end if;

  insert into public.notifications (recipient_id, kind, title, body, link, data)
  values (
    v_recipient_profile_id,
    'mail_received',
    v_title,
    v_body,
    '/me',
    jsonb_build_object(
      'source_table', 'outbound_mails',
      'source_id', new.id,
      'channel', 'mail',
      'mail_source', new.source,
      'sender_profile_id', new.sender_profile_id
    )
  );

  return new;
exception when others then
  -- Best-effort : on log mais on ne fait pas echouer l'INSERT outbound_mails
  raise warning 'notify_recipient_on_outbound_mail error: %', SQLERRM;
  return new;
end;
$$;

drop trigger if exists trg_notif_outbound_mail on public.outbound_mails;
create trigger trg_notif_outbound_mail
  after insert on public.outbound_mails
  for each row execute function public.notify_recipient_on_outbound_mail();

-- ============================================================================
-- 5. Trigger sur chat_messages -> notification a chaque membre de la room
-- ============================================================================
create or replace function public.notify_members_on_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_label text;
  v_room_name text;
  v_excerpt text;
  v_title text;
  v_body text;
  v_link text;
  v_muted boolean;
begin
  -- Skip si message est deleted (au cas ou l'app fait soft-delete en INSERT)
  if new.deleted_at is not null then return new; end if;

  -- Skip si source 'chat_message' globalement mutee
  select exists(select 1 from public.notification_mute_sources where source = 'chat_message')
    into v_muted;
  if v_muted then return new; end if;

  -- Sender + room name
  v_sender_label := public.resolve_sender_label(new.author_profile_id, null);
  select coalesce(nullif(trim(name), ''), 'discussion')
    into v_room_name
    from public.chat_rooms
    where id = new.room_id;
  if v_room_name is null then v_room_name := 'discussion'; end if;

  -- Extrait
  v_excerpt := nullif(trim(left(regexp_replace(new.body, '\s+', ' ', 'g'), 100)), '');
  if v_excerpt is null then v_excerpt := '(piece jointe)'; end if;
  if length(v_excerpt) >= 100 then v_excerpt := v_excerpt || '...'; end if;

  v_title := v_sender_label || ' t''a envoye un message dans ' || v_room_name;
  v_body := v_excerpt;
  v_link := '/chat/' || new.room_id::text;

  -- Insert une notif par membre actif (sauf auteur, sauf muted, sauf l'auteur)
  insert into public.notifications (recipient_id, kind, title, body, link, data)
  select
    m.profile_id,
    'chat_message',
    v_title,
    v_body,
    v_link,
    jsonb_build_object(
      'source_table', 'chat_messages',
      'source_id', new.id,
      'channel', 'chat',
      'room_id', new.room_id,
      'author_profile_id', new.author_profile_id
    )
  from public.chat_room_members m
  where m.room_id = new.room_id
    and m.profile_id is distinct from new.author_profile_id
    and m.is_muted = false;

  return new;
exception when others then
  raise warning 'notify_members_on_chat_message error: %', SQLERRM;
  return new;
end;
$$;

drop trigger if exists trg_notif_chat_message on public.chat_messages;
create trigger trg_notif_chat_message
  after insert on public.chat_messages
  for each row execute function public.notify_members_on_chat_message();
