-- Karim 2026-07-03 : indisponibilités déclarées par un CANDIDAT (pré-embauche,
-- étape 2 du formulaire /contract-info). Miroir de public.employee_unavailabilities.
-- Rejouées vers employee_unavailabilities à l'embauche du candidat.

create table if not exists public.candidate_unavailabilities (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  day_of_week smallint,          -- 0=dim .. 6=sam (indispo RÉCURRENTE)
  date_specific date,            -- date précise (indispo PROGRAMMÉE ponctuelle)
  start_time time,               -- optionnel (null = journée entière)
  end_time time,
  reason text,                   -- vacances / hospitalisation / examen / cours / perso / autre
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint candidate_unavail_kind_ck
    check (day_of_week is not null or date_specific is not null)
);

create index if not exists idx_candidate_unavail_candidate
  on public.candidate_unavailabilities(candidate_id);

-- Accès service-role uniquement (flux token public via createAdminClient).
alter table public.candidate_unavailabilities enable row level security;
