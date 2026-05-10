-- 20260620000210_public_apply.sql
--
-- Permet le dépôt d'une candidature via le formulaire public /postuler/[jobId].
--
-- État actuel : le code utilise `createAdminClient` (service role) côté server
-- action pour bypasser RLS — ça fonctionne déjà. Cette migration prépare le
-- terrain pour passer (en V2) à un client `anon` côté action sans changer la
-- DB. Elle est aussi utile pour les outils RH qui interrogent les policies.
--
-- Idempotente : drop + create pour pouvoir rejouer.
-- ---------------------------------------------------------------------------

-- 1) Autorise l'insertion publique dans `candidates` et `applications`.
--    Le service role bypass déjà RLS ; cette policy permet en plus une
--    soumission côté `anon` si on souhaite l'utiliser plus tard.

drop policy if exists "candidates_public_insert" on candidates;
create policy "candidates_public_insert"
  on candidates
  for insert
  to anon
  with check (true);

drop policy if exists "applications_public_insert" on applications;
create policy "applications_public_insert"
  on applications
  for insert
  to anon
  with check (true);

-- 2) Bucket dédié aux CV téléchargés depuis le formulaire public.
--    L'existant utilise `documents/public-applications/…`. On crée
--    `candidate-cvs` en parallèle pour pouvoir migrer plus tard sans casser
--    le flux actuel. Privé : pas de lecture publique, seuls RH/managers/admin
--    et le service role peuvent récupérer un signed URL.

insert into storage.buckets (id, name, public)
values ('candidate-cvs', 'candidate-cvs', false)
on conflict (id) do nothing;

drop policy if exists "cvs_anon_upload" on storage.objects;
create policy "cvs_anon_upload"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'candidate-cvs');

drop policy if exists "cvs_rh_read" on storage.objects;
create policy "cvs_rh_read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'candidate-cvs'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'rh', 'manager')
    )
  );

-- 3) Signaler PostgREST de recharger le schéma (RLS).
notify pgrst, 'reload schema';
