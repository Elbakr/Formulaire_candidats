-- Karim 2026-06-15 : FIX RACINE — la notif « tu as reçu un mail » pointait vers
-- '/me' (générique = « Mes candidatures »), donc le clic ne montrait jamais le
-- mail/contrat concerné. On la fait pointer vers le MAIL PRÉCIS dans /me/mails
-- (ancre #mail-<id> -> la page scrolle sur ce mail, qui contient le lien de
-- signature cliquable). Règle : une notif renvoie UNIQUEMENT vers son objet.
--
-- On recrée uniquement la fonction (le trigger trg_notif_outbound_mail reste lié).

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
    return new;
  end if;

  -- Eviter auto-notification si l'expediteur est aussi le destinataire
  if new.sender_profile_id is not null
     and new.sender_profile_id = v_recipient_profile_id then
    return new;
  end if;

  v_sender_label := public.resolve_sender_label(new.sender_profile_id, new.sender_name);

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
    '/me/mails#mail-' || new.id::text,  -- FIX : deep-link vers le mail précis
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
  raise warning 'notify_recipient_on_outbound_mail error: %', SQLERRM;
  return new;
end;
$$;
