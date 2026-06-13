-- Karim 2026-06-13 : remplace le magic link casse de "demander infos manquantes"
-- par un lien a TOKEN autonome (page publique /contract-info/{token}, URL stable
-- Vercel). Le travailleur complete sa fiche sans compte ni magic link. Deja
-- appliquee a la prod (additive).

create table if not exists public.contract_info_tokens (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  token text not null unique,
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.contract_info_tokens enable row level security;
-- Acces via service-role (admin client) cote serveur uniquement ; le token fait
-- foi dans le handler de la page. Pas de policy publique.
