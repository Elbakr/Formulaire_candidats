-- Karim 2026-06-10 (chat WhatsApp) : bucket prive pour les photos envoyees
-- dans le chat. Chemin = "<room_id>/<uuid>.<ext>" -> le 1er dossier identifie
-- la room, ce qui permet de restreindre l'acces aux SEULS membres de la room.
-- Acces normal via URLs signees generees cote serveur (pattern existant
-- payslips/selfies), mais on pose aussi des policies RLS pour un acces client
-- direct securise.

insert into storage.buckets (id, name, public)
  values ('chat-media', 'chat-media', false)
  on conflict (id) do nothing;

-- Lecture : uniquement les membres de la room (1er segment du chemin).
drop policy if exists "chat_media_member_read" on storage.objects;
create policy "chat_media_member_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.chat_room_members m
      where m.room_id::text = (storage.foldername(name))[1]
        and m.profile_id = auth.uid()
    )
  );

-- Upload : uniquement les membres de la room.
drop policy if exists "chat_media_member_insert" on storage.objects;
create policy "chat_media_member_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.chat_room_members m
      where m.room_id::text = (storage.foldername(name))[1]
        and m.profile_id = auth.uid()
    )
  );
