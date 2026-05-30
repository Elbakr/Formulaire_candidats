-- Karim 2026-05-29 : buckets storage pour fiches de paie
-- payslip-batches : PDFs groupes originaux (audit + retraitement)
-- payslips : PDFs splittes par employee (envoi mail + telechargement)

insert into storage.buckets (id, name, public) values ('payslip-batches', 'payslip-batches', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('payslips', 'payslips', false)
  on conflict (id) do nothing;

-- Lecture : admin/rh uniquement (via service role pour le moment ; service role bypass RLS)
-- Insert : admin/rh uniquement
-- Note : ces buckets sont prives, les liens d acces se font via createSignedUrl
--       depuis le server action sendPayslipToEmployeeAction (valable 7 jours).

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

-- Employees peuvent lire leurs propres fiches via le chemin (employer_org/year-month/slug-name_batchId.pdf)
-- Pour le moment, l acces aux PDF se fait via URL signee depuis le server.
-- Ajouter une policy "employee can read own payslip" plus tard si on veut une UX self-service.
