-- Karim 2026-06-18 : entités juridiques (employeurs) en TABLE éditable + rattachement
-- des sites à leur entité. Les documents sortants (contrats, rupture) prennent l'entité
-- du site principal du travailleur, avec le bon libellé de signature.
--   - AMD Megastore : sites A, D  -> signature « Caftan Factory By AMD Megastore »
--   - Caftan Factory : sites B, C, E, F -> signature « Caftan Factory »
--   - Homix : site G (créé ici) -> signature « Homix »

create table if not exists public.employer_orgs (
  key text primary key,
  name text not null,                 -- raison sociale (ex. AMD MEGASTORE SRL)
  signature_label text not null,      -- libellé de signature / branding sortant
  address text,
  locality text,                      -- ex. « 1030 Schaerbeek »
  bce text,
  onss text,
  rc text,
  representative text,
  co_representative text,
  co_representative_email text,
  paritary_commission text,
  email text,
  phone text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employer_orgs enable row level security;
drop policy if exists employer_orgs_read on public.employer_orgs;
create policy employer_orgs_read on public.employer_orgs for select to authenticated using (true);
drop policy if exists employer_orgs_admin on public.employer_orgs;
create policy employer_orgs_admin on public.employer_orgs for all
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));

create or replace function public.touch_employer_orgs() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_touch_employer_orgs on public.employer_orgs;
create trigger trg_touch_employer_orgs before update on public.employer_orgs
  for each row execute function public.touch_employer_orgs();

-- Seed (valeurs connues + placeholders à compléter via l'admin).
insert into public.employer_orgs
  (key, name, signature_label, address, locality, bce, onss, rc, representative, co_representative, co_representative_email, paritary_commission, sort_order)
values
  ('amd_megastore', 'AMD MEGASTORE SRL', 'Caftan Factory By AMD Megastore', 'Rue de Brabant 230', '1030 Schaerbeek', '0660.936.422', '1234567-89', 'Bruxelles', 'Karim Elbazi', 'Kamal Elbazi', 'kamal@elbazi.com', 'CP du commerce de détail indépendant n°201', 1),
  ('caftan_factory', 'CAFTAN FACTORY', 'Caftan Factory', 'Adresse Bruxelles à compléter', '1000 Bruxelles', null, null, 'Bruxelles', 'Karim Elbazi', null, null, 'CP du commerce de détail indépendant n°201', 2),
  ('homix', 'HOMIX', 'Homix', null, null, null, null, null, 'Karim Elbazi', null, null, 'CP du commerce de détail indépendant n°201', 3)
on conflict (key) do nothing;

-- Rattachement des sites à leur entité.
alter table public.sites add column if not exists employer_org_key text references public.employer_orgs(key) on delete set null;

-- Crée le site G (Homix) s'il n'existe pas encore.
insert into public.sites (code, name, abbr, city, is_active, sort_order)
select 'G', 'G Homix', 'G', 'À définir', true, 99
where not exists (select 1 from public.sites where code = 'G');

update public.sites set employer_org_key = 'amd_megastore' where code in ('A', 'D');
update public.sites set employer_org_key = 'caftan_factory' where code in ('B', 'C', 'E', 'F');
update public.sites set employer_org_key = 'homix' where code = 'G';
