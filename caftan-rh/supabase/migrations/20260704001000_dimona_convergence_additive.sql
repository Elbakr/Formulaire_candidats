-- Karim 2026-07-04 (audit C1) : convergence Dimona. Le schéma A (LIVE, 10 lignes
-- légales ONSS) reste la SOURCE DE VÉRITÉ. Migration purement ADDITIVE et nullable :
-- on n'ajoute QUE les 2 concepts nouveaux du code "camp B" qu'aucune colonne A ne
-- couvre. Le reste de la convergence = renommage CÔTÉ CODE (kind->declaration_kind,
-- declared_start_date->start_date, note->notes, status 'declared'->'declared_onss').
-- Aucune colonne existante touchée, aucun NOT NULL ajouté, aucune ligne modifiée.
alter table public.dimona_declarations
  add column if not exists employer_org_key text,   -- entité employeur émettrice (multi-magasins)
  add column if not exists dimona_period_id text;   -- n° de période/accusé ONSS
