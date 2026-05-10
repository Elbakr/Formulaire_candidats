-- Fix RLS récursive sur chat_room_members.
--
-- La policy précédente faisait `select 1 from chat_room_members where ...`
-- depuis une policy SUR `chat_room_members` → récursion infinie.
--
-- Solution : fonction `is_chat_member(room_id)` `security definer` qui
-- bypass RLS. Toutes les policies qui ont besoin de tester l'appartenance
-- l'utilisent au lieu d'un sous-SELECT.

create or replace function is_chat_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from chat_room_members
    where room_id = p_room and profile_id = auth.uid()
  );
$$;

-- Re-créer les policies en utilisant la fonction.
drop policy if exists chat_rooms_read           on chat_rooms;
drop policy if exists chat_members_read         on chat_room_members;
drop policy if exists chat_messages_read        on chat_messages;
drop policy if exists chat_messages_insert      on chat_messages;

create policy chat_rooms_read on chat_rooms for select using (
  is_rh() or is_chat_member(id)
);

create policy chat_members_read on chat_room_members for select using (
  is_rh()
  or profile_id = auth.uid()
  or is_chat_member(room_id)
);

create policy chat_messages_read on chat_messages for select using (
  is_rh() or is_chat_member(room_id)
);

create policy chat_messages_insert on chat_messages for insert with check (
  author_profile_id = auth.uid() and is_chat_member(room_id)
);
