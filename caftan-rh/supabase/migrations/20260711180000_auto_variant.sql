-- Karim 2026-07-11 : mode AUTO-VARIANT (tablette), en plus d'Auto-Shift.
--
-- Auto-Variant = la tablette choisit AUTOMATIQUEMENT le variant A/B/C qui répond
-- le mieux à la situation du JOUR (le variant qui a un shift aujourd'hui ; sinon
-- celui dont le prochain shift est le plus proche ; sinon A). Cas d'usage : retour
-- de congé / désistement -> le travailleur voit direct le planning du moment.
--
-- Précédence côté tablette :
--   1) Auto-Shift (individuel OU global) -> planning RÉEL du jour
--   2) sinon Auto-Variant -> variant auto-choisi pour aujourd'hui
--   3) sinon -> variant coché par défaut (selected_variant, défaut A)
-- Auto-Shift et Auto-Variant sont MUTUELLEMENT EXCLUSIFS (activer l'un coupe l'autre).

alter table public.employees
  add column if not exists auto_variant boolean not null default false;
