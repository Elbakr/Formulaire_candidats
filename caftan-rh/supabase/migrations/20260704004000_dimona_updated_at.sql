-- Karim 2026-07-04 : le trigger trg_dimona_touch (BEFORE UPDATE) ecrit NEW.updated_at
-- mais la colonne n'existait pas (schema A) -> toute MAJ (ex. "marquer Dimona
-- declaree") echouait avec 'record "new" has no field "updated_at"'. Additif.
alter table public.dimona_declarations
  add column if not exists updated_at timestamptz default now();
