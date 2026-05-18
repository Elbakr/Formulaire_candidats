-- Karim 18/05 : score de match candidat (0-100) pour "denicher les meilleurs
-- profils" selon proximite, langues, age, fraicheur (criteres prioritaires
-- valides par Karim via AskUserQuestion).
--
-- Le score est calcule par caftan-rh/src/lib/scoring/candidate-match-score.ts
-- et persiste pour ne pas recalculer a chaque load de la page Top Profils.
-- Recalcule periodiquement via scripts/recompute-candidate-scores.mjs.

alter table candidates add column if not exists match_score integer
  check (match_score is null or (match_score between 0 and 100));
alter table candidates add column if not exists match_breakdown jsonb;
alter table candidates add column if not exists match_score_computed_at timestamptz;

create index if not exists idx_candidates_match_score
  on candidates(match_score desc nulls last)
  where match_score is not null;

comment on column candidates.match_score is
  'Score global de matching (0-100). Calcule par lib/scoring/candidate-match-score.ts depuis 4 axes : proximite + langues + age + fraicheur (25 pts chacun).';
comment on column candidates.match_breakdown is
  'Detail JSON du score : {proximity: N, languages: N, age: N, freshness: N, city_match: "label", reason: "..."}.';
