-- Karim 2026-05-29 : buckets storage pour fiches de paie

insert into storage.buckets (id, name, public) values ('payslip-batches', 'payslip-batches', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('payslips', 'payslips', false)
  on conflict (id) do nothing;

create policy "payslip_batches_admin_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payslip-batches'
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
  );

create policy "payslip_batches_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payslip-batches'
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
  );

create policy "payslips_admin_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payslips'
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
  );

create policy "payslips_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payslips'
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
  );
