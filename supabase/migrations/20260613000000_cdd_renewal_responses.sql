-- Karim 2026-06-13 : pre-avis de renouvellement (CDD + Etudiant).
-- 15 jours avant la fin du contrat, RH envoie un mail au travailleur (1 clic) ;
-- celui-ci repond via /renewal/{token} : Oui/Non + dates de dispo + raison +
-- appreciation. Deja appliquee a la prod (additive, idempotente).

create table if not exists public.cdd_renewal_responses (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  contract_end_date date not null,
  contract_type text,
  token text not null unique,
  sent_at timestamptz,
  wants_renewal boolean,
  available_from date,
  available_to date,
  reason text,
  appreciation text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (employee_id, contract_end_date)
);

alter table public.cdd_renewal_responses enable row level security;
-- Acces uniquement via service-role (admin client) cote serveur : la page
-- /renewal/{token} et les actions utilisent createAdminClient. Pas de policy
-- publique (le token fait foi cote handler).
