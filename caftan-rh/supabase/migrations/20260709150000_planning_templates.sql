-- Karim 2026-07-09 : MODÈLES DE PLANNING réutilisables (capitaliser une bonne
-- répartition validée).
--
-- Depuis l'affichage des 2 variantes (fiche travailleur), l'admin peut
-- « Enregistrer comme modèle » la meilleure variante. Le `pattern` stocke la
-- STRUCTURE ABSTRAITE (indépendante des dates réelles) : heure de début, durée
-- de shift, heures contractuelles cibles, et la LOGIQUE de répartition
-- (start_offset : 0 = « jours consécutifs à partir du 1er dispo » = variante A ;
-- 1 = agencement variante B, etc.). PAS de dates concrètes -> réutilisable sur
-- n'importe quel travailleur / n'importe quelle date de début.
--
-- Objet SÉPARÉ et PERSISTANT : contrairement à planning_proposals (une seule
-- proposition COURANTE par employé, écrasée à chaque génération), un modèle ne
-- se fait jamais écraser par une nouvelle génération.
--
-- Idempotent (if not exists) — ré-exécutable sans effet de bord.

create table if not exists public.planning_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_employee_id uuid references public.employees(id) on delete set null,
  pattern jsonb not null,                -- { start_offset, default_start_time,
                                         --   default_shift_hours, weekly_hours, weeks }
  created_at timestamptz not null default now(),
  created_by text                        -- 'manual:<profile_id>'
);

create index if not exists idx_planning_templates_created
  on public.planning_templates(created_at desc);

-- RLS : lu/écrit par admin/rh (même pattern que planning_proposals).
alter table public.planning_templates enable row level security;
drop policy if exists planning_templates_admin on public.planning_templates;
create policy planning_templates_admin on public.planning_templates for all
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
