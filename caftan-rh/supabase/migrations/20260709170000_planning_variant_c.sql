-- Karim 2026-07-09 : PROPOSITION DE PLANNING — 3e VARIANTE « C » (répartie).
--
-- En plus de la variante A (jours les plus tôt) et B (jours les plus tard), on
-- ajoute une variante C « répartie sur toute la semaine » : un shift sur CHAQUE
-- jour disponible (hors OFF / indispo), durée/jour = weekly_hours / joursDispos
-- plafonnée à default_shift_hours. Objectif : offrir au travailleur le plus large
-- éventail de choix (pas seulement 2 blocs opposés).
--
-- 1) Nouvelle colonne `variant_c jsonb` (même format que variant_a / variant_b).
--    Nullable : les propositions déjà générées (avant cette migration) n'ont pas
--    de C tant qu'elles ne sont pas régénérées — l'app tolère l'absence.
-- 2) La variante par défaut (tablette) accepte désormais 'A' | 'B' | 'C'.
--
-- Tout est idempotent (if not exists / drop-then-create) — ré-exécutable.

alter table public.planning_proposals
  add column if not exists variant_c jsonb;

-- selected_variant : autoriser 'C' en plus de 'A' / 'B'.
alter table public.planning_proposals
  drop constraint if exists planning_proposals_selected_variant_ck;
alter table public.planning_proposals
  add constraint planning_proposals_selected_variant_ck
  check (selected_variant is null or selected_variant in ('A', 'B', 'C'));
