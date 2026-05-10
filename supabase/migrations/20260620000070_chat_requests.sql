-- Demandes spécifiques émises depuis les chats
-- (commande produit pour le futur module produit, demande RH, matériel,
-- changement d'horaire, autre).
--
-- Liée 1-1 au message chat qui l'a émise (`source_message_id`) pour rendu
-- spécial dans le thread + tracking de statut côté direction.
--
-- Idempotente.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'chat_request_kind') then
    create type chat_request_kind as enum (
      'product',     -- demande produit boutique (lié au futur module produit)
      'work_item',   -- demande de tâche / mission / projet
      'time_change', -- demande de changement d'horaire / congé / swap
      'supplies',    -- matériel, consommables, équipement
      'maintenance', -- panne, réparation, propreté
      'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'chat_request_status') then
    create type chat_request_status as enum ('open','in_progress','done','rejected');
  end if;
end $$;

create table if not exists chat_requests (
  id uuid primary key default uuid_generate_v4(),
  source_message_id uuid not null references chat_messages(id) on delete cascade,
  room_id uuid not null references chat_rooms(id) on delete cascade,
  author_profile_id uuid references profiles(id) on delete set null,
  kind chat_request_kind not null default 'other',
  title text not null,
  body text,
  external_ref text,                            -- pour le futur module produit (slug/sku/url)
  quantity numeric,
  urgency text not null default 'normal',       -- 'low' | 'normal' | 'urgent'
  status chat_request_status not null default 'open',
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_requests_room on chat_requests (room_id);
create index if not exists idx_chat_requests_status on chat_requests (status);
create index if not exists idx_chat_requests_message on chat_requests (source_message_id);

alter table chat_requests enable row level security;

drop policy if exists chat_requests_read   on chat_requests;
drop policy if exists chat_requests_insert on chat_requests;
drop policy if exists chat_requests_update on chat_requests;
drop policy if exists chat_requests_delete on chat_requests;

-- Lecture : membre de la room ou direction
create policy chat_requests_read on chat_requests for select using (
  is_rh() or is_chat_member(room_id)
);

-- Création : membre + auteur = soi-même
create policy chat_requests_insert on chat_requests for insert with check (
  author_profile_id = auth.uid() and is_chat_member(room_id)
);

-- Update : auteur (peut modifier titre/body) ou direction (statut + résolution)
create policy chat_requests_update on chat_requests for update
  using (author_profile_id = auth.uid() or is_rh())
  with check (author_profile_id = auth.uid() or is_rh());

-- Delete : auteur ou direction
create policy chat_requests_delete on chat_requests for delete
  using (author_profile_id = auth.uid() or is_rh());

do $$ begin
  begin alter publication supabase_realtime add table chat_requests; exception when duplicate_object then null; end;
end $$;
