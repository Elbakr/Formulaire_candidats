-- Karim 2026-07-03 : indisponibilité PROGRAMMÉE sur une PÉRIODE (vacances du..au),
-- pas seulement un jour. date_end nullable : si présent, la période va de
-- date_specific à date_end inclus ; sinon date_specific = journée unique.
alter table public.candidate_unavailabilities
  add column if not exists date_end date;
