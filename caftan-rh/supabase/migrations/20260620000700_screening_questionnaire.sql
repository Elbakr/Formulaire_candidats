-- Karim 2026-05-31 : système de questionnaire profilage candidat (voir migration sister dans repo root)
-- 8 categories : math/caisse, clientele, valeurs/ethique, personnalite,
-- serieux, langues (FR/AR/EN), ponctualite, disponibilite.

create table if not exists public.screening_questionnaires (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  version int not null default 1,
  is_default boolean not null default false,
  min_score_to_hire numeric(5, 2) default 60.00,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.screening_questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.screening_questionnaires(id) on delete cascade,
  category text not null,
  question_text text not null,
  question_subtitle text,
  type text not null,
  options jsonb default '[]'::jsonb,
  weight numeric(5, 2) default 1.00,
  sort_order int default 0,
  is_required boolean default true,
  is_red_flag_question boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_screening_questions_questionnaire on public.screening_questions(questionnaire_id, sort_order);

create table if not exists public.screening_responses (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.candidates(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  questionnaire_id uuid not null references public.screening_questionnaires(id),
  started_at timestamptz default now(),
  completed_at timestamptz,
  total_score numeric(5, 2),
  category_scores jsonb default '{}'::jsonb,
  has_red_flag boolean default false,
  recommendation text,
  rh_notes text,
  rh_decision_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_screening_responses_candidate on public.screening_responses(candidate_id);

create table if not exists public.screening_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.screening_responses(id) on delete cascade,
  question_id uuid not null references public.screening_questions(id),
  value_text text,
  value_num numeric,
  value_array jsonb,
  score_obtained numeric(5, 2) default 0,
  is_red_flag_triggered boolean default false,
  answered_at timestamptz default now()
);

create index if not exists idx_screening_answers_response on public.screening_answers(response_id);

alter table public.screening_questionnaires enable row level security;
alter table public.screening_questions enable row level security;
alter table public.screening_responses enable row level security;
alter table public.screening_answers enable row level security;

create policy "screening_q_read" on public.screening_questionnaires for select to authenticated using (true);
create policy "screening_q_write" on public.screening_questionnaires for all
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));

create policy "screening_questions_read" on public.screening_questions for select to authenticated using (true);
create policy "screening_questions_write" on public.screening_questions for all
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));

create policy "screening_responses_rh_read" on public.screening_responses for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
create policy "screening_responses_candidate_own" on public.screening_responses for select
  using (candidate_id in (select id from public.candidates where profile_id = auth.uid()));
create policy "screening_responses_all_write" on public.screening_responses for all
  using (
    (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
    or candidate_id in (select id from public.candidates where profile_id = auth.uid())
  )
  with check (
    (select role from public.profiles where id = auth.uid()) in ('admin', 'rh')
    or candidate_id in (select id from public.candidates where profile_id = auth.uid())
  );

create policy "screening_answers_rh_read" on public.screening_answers for select
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'rh'));
create policy "screening_answers_candidate_own" on public.screening_answers for all
  using (response_id in (
    select sr.id from public.screening_responses sr
    join public.candidates c on c.id = sr.candidate_id
    where c.profile_id = auth.uid()
  ))
  with check (response_id in (
    select sr.id from public.screening_responses sr
    join public.candidates c on c.id = sr.candidate_id
    where c.profile_id = auth.uid()
  ));

insert into public.screening_questionnaires (slug, name, description, version, is_default, min_score_to_hire)
values ('caftanrh-default-v1', 'CaftanRH Screening v1', 'Questionnaire de profilage candidat - 40 questions structurées', 1, true, 65.00)
on conflict (slug) do nothing;

-- Seed des questions (voir migration root pour le détail)
