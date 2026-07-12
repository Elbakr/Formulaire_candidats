-- Karim 2026-07-12 : le bilan de sortie demande AUSSI si le travailleur veut
-- redevenir CANDIDAT (rappelable pour de futures opportunités) ou pas du tout.
alter table public.training_exit_survey
  add column if not exists wants_candidate boolean;
