-- Karim 18/05 : score 0-100 calcule depuis les reponses au pre-entretien.
-- Vient enrichir match_score (qualite brute du profil) avec un signal sur
-- l engagement et la qualite des reponses. Le RH voit les 2 cote a cote.

alter table candidates add column if not exists pre_interview_score integer
  check (pre_interview_score is null or (pre_interview_score between 0 and 100));
alter table candidates add column if not exists pre_interview_breakdown jsonb;
alter table candidates add column if not exists pre_interview_score_computed_at timestamptz;

create index if not exists idx_candidates_pi_score
  on candidates(pre_interview_score desc nulls last)
  where pre_interview_score is not null;

comment on column candidates.pre_interview_score is
  'Score 0-100 des reponses au pre-entretien. Disponible uniquement si pre_interview.status=completed. Voir lib/scoring/pre-interview-score.ts.';
comment on column candidates.pre_interview_breakdown is
  'Detail JSON : { availability, mobility, communication_channels, text_quality, videos, bonus }.';
