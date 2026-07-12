-- Karim 2026-07-12 : ajouts au programme de formation.
--  1) Champ COMMENTAIRE/ANOMALIE en bas de chaque page (à tout moment).
--  2) Mail BILAN chaleureux de fin de cycle (après lecture complète + dernier examen) :
--     ressenti formation/collègues/travail/salaire/horaire + dispo future. Timing :
--     idéalement 10–15 j avant fin de contrat, AU PLUS TARD 3 j avant.
--  3) PRISE DE POULS périodique : tous les 15 j pour les contrats < 3 mois.

-- 1) Commentaires / anomalies libres du travailleur (depuis la page de formation).
create table if not exists public.training_feedback (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  module_seq int,                          -- section en cours au moment du message (optionnel)
  kind text not null default 'comment',    -- 'comment' | 'anomaly' | 'info'
  message text not null,
  handled_at timestamptz,                  -- traité par l'admin
  created_at timestamptz not null default now()
);
create index if not exists training_feedback_emp_idx on public.training_feedback (employee_id, created_at desc);

-- 2) Bilan de fin de cycle (enquête chaleureuse).
create table if not exists public.training_exit_survey (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  token text not null unique,              -- lien public /bilan/<token>
  sent_at timestamptz,
  submitted_at timestamptz,
  rating_training int,                     -- 1..5
  rating_colleagues int,
  rating_work int,
  rating_salary int,
  rating_schedule int,
  free_text text,
  available_again boolean,                 -- dispo si on a encore besoin
  availability_note text,
  created_at timestamptz not null default now(),
  unique(employee_id)
);

-- 3) Prise de pouls périodique (tous les 15 j, contrats < 3 mois).
create table if not exists public.training_sentiment (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  token text not null,                     -- lien public /pouls/<token> (par vague)
  asked_at timestamptz not null default now(),
  answered_at timestamptz,
  feeling int,                             -- 1..5 (ressenti global)
  note text
);
create index if not exists training_sentiment_emp_idx on public.training_sentiment (employee_id, asked_at desc);

-- Jalons de planification sur l'inscription.
alter table public.training_enrollments
  add column if not exists completed_at timestamptz,          -- toute la formation lue + dernier examen fait
  add column if not exists exit_survey_sent_at timestamptz,   -- bilan de fin envoyé
  add column if not exists last_sentiment_at timestamptz;     -- dernière prise de pouls
