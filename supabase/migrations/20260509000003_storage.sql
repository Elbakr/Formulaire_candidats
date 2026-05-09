-- Storage buckets & policies
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

create policy "documents_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and is_manager());

create policy "documents_owner_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and owner = auth.uid());

create policy "documents_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');

create policy "documents_public_postuler_insert"
  on storage.objects for insert to anon
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'public-applications');

create policy "avatars_public_read"
  on storage.objects for select using (bucket_id = 'avatars');

create policy "avatars_self_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_self_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
