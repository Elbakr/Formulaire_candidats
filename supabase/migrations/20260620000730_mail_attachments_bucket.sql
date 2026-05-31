-- Karim 2026-05-31 : bucket storage pour pièces jointes mail
insert into storage.buckets (id, name, public) values ('mail-attachments', 'mail-attachments', false)
  on conflict (id) do nothing;

create policy "mail_attachments_admin_rh_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'mail-attachments'
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
  );

create policy "mail_attachments_admin_rh_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mail-attachments'
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
  );

-- Employee voit les attachments des mails qui lui ont été envoyés (via outbound_mails)
create policy "mail_attachments_recipient_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'mail-attachments'
    and exists (
      select 1 from public.outbound_mails om
      join public.employees e on e.id = om.employee_id
      where e.profile_id = auth.uid()
        and om.attachments::text like '%' || (storage.foldername(name))[1] || '%'
    )
  );
