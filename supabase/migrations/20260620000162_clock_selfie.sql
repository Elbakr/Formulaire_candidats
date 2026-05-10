-- Module 4 — Photo selfie au clock-in (RGPD : conservation 30 jours).
--
-- Stockage du chemin Storage dans clock_entries + politique RLS sur le bucket
-- `clock-selfies` (private). Une cron quotidienne purge les fichiers dont
-- selfie_purge_after est passé.
--
-- L'historique horodaté de clock_entries est conservé : on supprime UNIQUEMENT
-- le fichier (selfie_storage_path → null). Ainsi les statistiques de pointage
-- restent intactes même après purge RGPD.
--
-- Idempotente.

-- 1) Colonnes additives sur clock_entries.
alter table clock_entries
  add column if not exists selfie_storage_path text,
  add column if not exists selfie_purge_after timestamptz;

create index if not exists idx_clock_selfie_purge
  on clock_entries (selfie_purge_after)
  where selfie_storage_path is not null;

-- 2) Org settings : exigence selfie + durée de rétention.
alter table org_settings
  add column if not exists clock_require_selfie boolean default true,
  add column if not exists clock_selfie_keep_days int default 30
    check (clock_selfie_keep_days is null or clock_selfie_keep_days > 0);

-- 3) Bucket Storage `clock-selfies` (private). Idempotent.
insert into storage.buckets (id, name, public)
values ('clock-selfies', 'clock-selfies', false)
on conflict (id) do nothing;

-- 4) RLS sur storage.objects pour ce bucket.
-- Convention path : `<auth.uid>/<timestamp>.jpg` — le 1er segment est l'uid.
-- L'employé peut uploader uniquement dans son propre dossier.
-- L'employé peut lire ses propres selfies. RH peut lire tout. Admin peut delete.
drop policy if exists clock_selfies_user_upload on storage.objects;
drop policy if exists clock_selfies_user_read on storage.objects;
drop policy if exists clock_selfies_admin_delete on storage.objects;
drop policy if exists clock_selfies_rh_read on storage.objects;

create policy clock_selfies_user_upload on storage.objects
  for insert
  with check (
    bucket_id = 'clock-selfies'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy clock_selfies_user_read on storage.objects
  for select
  using (
    bucket_id = 'clock-selfies'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or coalesce(
        (auth.jwt() ->> 'role') in ('admin', 'rh', 'manager'),
        false
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin', 'rh', 'manager')
      )
    )
  );

create policy clock_selfies_admin_delete on storage.objects
  for delete
  using (
    bucket_id = 'clock-selfies'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'rh')
    )
  );

notify pgrst, 'reload schema';
