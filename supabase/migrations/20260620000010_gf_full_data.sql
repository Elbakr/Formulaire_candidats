-- Sauvegarde complète des données Gravity Forms : CV + tous les champs riches.
-- Bug pré-existant : on importait 1809 candidats mais on perdait le CV et 90 % des champs GF.

alter table candidates
  add column if not exists cv_url text,
  add column if not exists gf_full_payload jsonb;

create index if not exists idx_candidates_cv_url on candidates (cv_url) where cv_url is not null;
create index if not exists idx_candidates_has_cv on candidates ((cv_url is not null));
