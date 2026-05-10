-- Chat interne — DMs + groupes custom + groupes par site (A..F)
--
-- 3 tables :
--   * `chat_rooms`         : conversation (DM, groupe libre, groupe-site auto)
--   * `chat_room_members`  : membres (profile_id) + last_read_at pour les badges
--   * `chat_messages`      : messages (auteur, body, attachments, reply_to)
--
-- Realtime : INSERT/UPDATE sur chat_messages.
-- RLS : on ne lit que les rooms dont on est membre.
--
-- Idempotente.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'chat_room_kind') then
    create type chat_room_kind as enum ('site_group','dm','custom_group');
  end if;
end $$;

create table if not exists chat_rooms (
  id uuid primary key default uuid_generate_v4(),
  kind chat_room_kind not null,
  name text not null,
  description text,
  site_id uuid references sites(id) on delete cascade,   -- only for site_group
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  is_archived boolean not null default false,
  unique (kind, site_id)  -- 1 seul site_group par site
);
create index if not exists idx_chat_rooms_site on chat_rooms (site_id);
create index if not exists idx_chat_rooms_kind on chat_rooms (kind);

create table if not exists chat_room_members (
  room_id uuid not null references chat_rooms(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member',                   -- 'admin' | 'member'
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  is_muted boolean not null default false,
  primary key (room_id, profile_id)
);
create index if not exists idx_chat_members_profile on chat_room_members (profile_id);

create table if not exists chat_messages (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  author_profile_id uuid references profiles(id) on delete set null,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  reply_to_id uuid references chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists idx_chat_messages_room_created on chat_messages (room_id, created_at desc);

alter table chat_rooms          enable row level security;
alter table chat_room_members   enable row level security;
alter table chat_messages       enable row level security;

drop policy if exists chat_rooms_read           on chat_rooms;
drop policy if exists chat_rooms_admin          on chat_rooms;
drop policy if exists chat_members_read         on chat_room_members;
drop policy if exists chat_members_self_update  on chat_room_members;
drop policy if exists chat_members_admin        on chat_room_members;
drop policy if exists chat_messages_read        on chat_messages;
drop policy if exists chat_messages_insert      on chat_messages;
drop policy if exists chat_messages_update_own  on chat_messages;
drop policy if exists chat_messages_delete_own  on chat_messages;

-- Lecture des rooms : membre de la room OU rôle direction (admin/rh)
create policy chat_rooms_read on chat_rooms for select using (
  is_rh()
  or exists (
    select 1 from chat_room_members m
    where m.room_id = chat_rooms.id and m.profile_id = auth.uid()
  )
);

-- Création / archivage des rooms : RH/admin
create policy chat_rooms_admin on chat_rooms for all
  using (is_rh()) with check (is_rh());

-- Lecture des membres : RH ou un membre de la même room
create policy chat_members_read on chat_room_members for select using (
  is_rh()
  or profile_id = auth.uid()
  or exists (
    select 1 from chat_room_members m2
    where m2.room_id = chat_room_members.room_id and m2.profile_id = auth.uid()
  )
);

-- Mise à jour de son propre `last_read_at` ou `is_muted`
create policy chat_members_self_update on chat_room_members for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- RH peut tout gérer
create policy chat_members_admin on chat_room_members for all
  using (is_rh()) with check (is_rh());

-- Lecture des messages : il faut être membre de la room (ou RH)
create policy chat_messages_read on chat_messages for select using (
  is_rh()
  or exists (
    select 1 from chat_room_members m
    where m.room_id = chat_messages.room_id and m.profile_id = auth.uid()
  )
);

-- Envoi d'un message : il faut être membre + auteur = auth.uid()
create policy chat_messages_insert on chat_messages for insert with check (
  author_profile_id = auth.uid()
  and exists (
    select 1 from chat_room_members m
    where m.room_id = chat_messages.room_id and m.profile_id = auth.uid()
  )
);

create policy chat_messages_update_own on chat_messages for update
  using (author_profile_id = auth.uid())
  with check (author_profile_id = auth.uid());

create policy chat_messages_delete_own on chat_messages for delete
  using (author_profile_id = auth.uid() or is_rh());

-- Realtime
do $$ begin
  begin alter publication supabase_realtime add table chat_rooms;        exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table chat_room_members; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table chat_messages;     exception when duplicate_object then null; end;
end $$;
