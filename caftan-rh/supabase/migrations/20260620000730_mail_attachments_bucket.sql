-- Karim 2026-05-31 : bucket storage mail-attachments
insert into storage.buckets (id, name, public) values ('mail-attachments', 'mail-attachments', false)
  on conflict (id) do nothing;
create policy "mail_attachments_admin_rh_read" on storage.objects for select to authenticated
  using (bucket_id='mail-attachments' and (select role from public.profiles where id=auth.uid()) in ('admin','rh'));
create policy "mail_attachments_admin_rh_insert" on storage.objects for insert to authenticated
  with check (bucket_id='mail-attachments' and (select role from public.profiles where id=auth.uid()) in ('admin','rh'));
