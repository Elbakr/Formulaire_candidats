-- Karim 2026-07-04 : barèmes de salaire ÉDITABLES (plancher). Aucune valeur légale
-- codée en dur : Karim remplit/édite la grille. Supporte un taux PLAT (par type de
-- contrat) ET des tranches par ÂGE (étudiant). Le contrat pré-remplit avec le
-- barème résolu et REFUSE toute saisie en-dessous (ajustement vers le haut only).
create table if not exists public.wage_baremes (
  id uuid primary key default gen_random_uuid(),
  contract_kind text not null default 'default',   -- 'default' | 'Étudiant' | 'CDD' | 'CDI' | ...
  age_min integer,                                  -- NULL = pas de borne basse
  age_max integer,                                  -- NULL = pas de borne haute
  hourly_rate numeric(6,2) not null,               -- € brut / heure (plancher + défaut)
  label text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_wage_baremes_kind on public.wage_baremes(contract_kind) where is_active;
alter table public.wage_baremes enable row level security;
-- Lecture pour tout utilisateur authentifié ; écriture via service-role (admin UI).
drop policy if exists wage_baremes_read on public.wage_baremes;
create policy wage_baremes_read on public.wage_baremes for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin','rh','manager'));
