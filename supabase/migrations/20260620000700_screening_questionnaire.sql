-- Karim 2026-05-31 : système de questionnaire profilage candidat
-- remplace partiellement l entretien RH avec score finement pondéré.
-- 8 categories : math/caisse, clientele, valeurs/ethique, personnalite,
-- serieux, langues (FR/AR/EN), ponctualite, disponibilite.

-- 1. Questionnaires (versions multiples possibles dans le temps)
create table if not exists public.screening_questionnaires (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  version int not null default 1,
  is_default boolean not null default false,
  min_score_to_hire numeric(5, 2) default 60.00,  -- % minimum pour proposer embauche
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Questions (avec poids et catégorie)
create table if not exists public.screening_questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.screening_questionnaires(id) on delete cascade,
  category text not null,             -- math|client|ethics|personality|seriousness|lang_fr|lang_ar|lang_en|punctuality|availability|red_flag
  question_text text not null,
  question_subtitle text,              -- contexte/explication
  type text not null,                  -- single_choice|multi_choice|scale|numeric|text_short|yes_no|date_array
  options jsonb default '[]'::jsonb,   -- [{ value, label, score, redFlag? }]
  weight numeric(5, 2) default 1.00,   -- multiplicateur dans le calcul score
  sort_order int default 0,
  is_required boolean default true,
  is_red_flag_question boolean default false,  -- si red flag = disqualification auto
  created_at timestamptz default now()
);

create index if not exists idx_screening_questions_questionnaire on public.screening_questions(questionnaire_id, sort_order);

-- 3. Réponses du candidat (1 réponse par questionnaire complet)
create table if not exists public.screening_responses (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.candidates(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  questionnaire_id uuid not null references public.screening_questionnaires(id),
  started_at timestamptz default now(),
  completed_at timestamptz,
  total_score numeric(5, 2),               -- 0-100
  category_scores jsonb default '{}'::jsonb, -- { math: 80, ethics: 95, ... }
  has_red_flag boolean default false,
  recommendation text,                       -- 'HIRE' | 'MAYBE' | 'PASS'
  rh_notes text,
  rh_decision_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_screening_responses_candidate on public.screening_responses(candidate_id);

-- 4. Réponses individuelles aux questions
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

-- RLS
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

-- ============ SEED QUESTIONNAIRE CAFTANRH ============
insert into public.screening_questionnaires (slug, name, description, version, is_default, min_score_to_hire)
values ('caftanrh-default-v1', 'CaftanRH Screening v1', 'Questionnaire de profilage candidat - 40 questions structurées', 1, true, 65.00)
on conflict (slug) do nothing;

-- ============ QUESTIONS SEED (40 questions, 8 catégories pondérées) ============
-- Récupère l ID du questionnaire seed
do $$
declare
  qid uuid;
begin
  select id into qid from public.screening_questionnaires where slug = 'caftanrh-default-v1';
  if qid is null then return; end if;

  -- Catégorie 1 : MATH / CAISSE (poids 1.5 - critique pour caisse)
  insert into public.screening_questions (questionnaire_id, category, question_text, type, options, weight, sort_order, is_required) values
    (qid, 'math', 'Combien font 23,50 € + 15,75 € + 8,90 € ?', 'numeric', '[{"correct": 48.15, "tolerance": 0.05, "score": 10}]'::jsonb, 1.5, 10, true),
    (qid, 'math', 'Un client paie un article à 12,40 € avec un billet de 50 €. Combien doit-il recevoir ?', 'numeric', '[{"correct": 37.60, "tolerance": 0.05, "score": 10}]'::jsonb, 1.5, 11, true),
    (qid, 'math', 'Un article coûte 80 € et fait -25%. Quel est le prix final ?', 'numeric', '[{"correct": 60, "tolerance": 0.50, "score": 10}]'::jsonb, 1.5, 12, true),
    (qid, 'math', 'Quel est le total de 3 robes à 75,90 € + 2 ceintures à 19,50 € ?', 'numeric', '[{"correct": 266.70, "tolerance": 0.10, "score": 10}]'::jsonb, 1.5, 13, true),
    (qid, 'math', 'Tu as 1200 € en caisse. Tu dois remettre 850 €. Combien reste ?', 'numeric', '[{"correct": 350, "tolerance": 0.50, "score": 10}]'::jsonb, 1.5, 14, true)
  on conflict do nothing;

  -- Catégorie 2 : CLIENTÈLE (poids 1.4 - image premium)
  insert into public.screening_questions (questionnaire_id, category, question_text, question_subtitle, type, options, weight, sort_order) values
    (qid, 'client', 'Une cliente entre, visiblement pressée et énervée. Tu fais quoi ?', null, 'single_choice',
     '[{"value":"a","label":"Je lui dis d attendre, j ai d autres clients","score":0},
       {"value":"b","label":"Je l accueille avec un sourire et je l aide rapidement","score":10},
       {"value":"c","label":"Je l ignore jusqu à ce qu elle se calme","score":-5},
       {"value":"d","label":"Je la priorise et m excuse pour l attente","score":8}]'::jsonb, 1.4, 20),
    (qid, 'client', 'Une cliente demande un échange d un article acheté il y a 2 mois sans ticket. Tu réponds quoi ?', null, 'single_choice',
     '[{"value":"a","label":"Je refuse direct","score":0},
       {"value":"b","label":"Je consulte la direction et propose une solution","score":10},
       {"value":"c","label":"Je l échange sans questions","score":2},
       {"value":"d","label":"Je vérifie le règlement et explique poliment","score":9}]'::jsonb, 1.3, 21),
    (qid, 'client', 'Une cliente t insulte parce que sa taille n est pas dispo. Réaction ?', null, 'single_choice',
     '[{"value":"a","label":"Je l insulte en retour","score":-10,"redFlag":true},
       {"value":"b","label":"Je garde mon calme et propose une commande","score":10},
       {"value":"c","label":"Je pleure","score":-2},
       {"value":"d","label":"J appelle la direction","score":7}]'::jsonb, 1.4, 22),
    (qid, 'client', 'À quel point penses-tu que l image et la présentation du magasin sont importantes ?', null, 'scale',
     '[{"min":1,"max":5,"labels":["Pas important","Crucial"],"scoreFormula":"linear"}]'::jsonb, 1.2, 23),
    (qid, 'client', 'Tu as fini ton rayon, le magasin est calme. Tu fais quoi ?', null, 'single_choice',
     '[{"value":"a","label":"Je regarde mon téléphone","score":-3,"redFlag":true},
       {"value":"b","label":"Je nettoie / range les présentoirs","score":10},
       {"value":"c","label":"Je discute avec mes collègues","score":2},
       {"value":"d","label":"Je propose mon aide à un autre rayon","score":9}]'::jsonb, 1.3, 24)
  on conflict do nothing;

  -- Catégorie 3 : VALEURS / ÉTHIQUE (poids 1.5 - critique)
  insert into public.screening_questions (questionnaire_id, category, question_text, type, options, weight, sort_order, is_red_flag_question) values
    (qid, 'ethics', 'Un collègue te propose de prendre un article gratuitement sans que la direction le sache. Tu fais quoi ?', 'single_choice',
     '[{"value":"a","label":"J accepte si personne ne voit","score":-15,"redFlag":true},
       {"value":"b","label":"Je refuse et préviens la direction","score":10},
       {"value":"c","label":"Je refuse mais je ne dis rien","score":5},
       {"value":"d","label":"Je demande si je peux l acheter avec une réduction","score":3}]'::jsonb, 1.5, 30, true),
    (qid, 'ethics', 'Tu trouves 50 € par terre dans le magasin. Tu fais quoi ?', 'single_choice',
     '[{"value":"a","label":"Je le mets dans la caisse / je préviens la direction","score":10},
       {"value":"b","label":"Je le garde pour moi","score":-15,"redFlag":true},
       {"value":"c","label":"Je demande à mes collègues","score":3},
       {"value":"d","label":"Je le laisse là","score":0}]'::jsonb, 1.5, 31, true),
    (qid, 'ethics', 'Une cliente paie en liquide et te donne 10 € de trop par erreur. Tu fais quoi ?', 'single_choice',
     '[{"value":"a","label":"Je la rappelle pour rendre la monnaie","score":10},
       {"value":"b","label":"Je garde la différence","score":-15,"redFlag":true},
       {"value":"c","label":"Je mets dans la caisse comme bonus","score":-10}]'::jsonb, 1.5, 32, true),
    (qid, 'ethics', 'À quel point l honnêteté est importante pour toi au travail ?', 'scale',
     '[{"min":1,"max":5,"labels":["Pas vraiment","Essentielle"]}]'::jsonb, 1.0, 33, false)
  on conflict do nothing;

  -- Catégorie 4 : PERSONNALITÉ / DÉTECTION MANIPULATION (poids 1.2)
  insert into public.screening_questions (questionnaire_id, category, question_text, type, options, weight, sort_order) values
    (qid, 'personality', 'Quand un collègue commet une erreur, ton premier réflexe est de :', 'single_choice',
     '[{"value":"a","label":"L aider à corriger sans drama","score":10},
       {"value":"b","label":"Le pointer du doigt devant les autres","score":-5,"redFlag":true},
       {"value":"c","label":"Le rapporter directement à la direction","score":3},
       {"value":"d","label":"Faire comme si je n avais rien vu","score":1}]'::jsonb, 1.2, 40),
    (qid, 'personality', 'Quand on te critique sur ton travail :', 'single_choice',
     '[{"value":"a","label":"Je remets en question la critique systematiquement","score":-2},
       {"value":"b","label":"J écoute, je prends note, je m améliore","score":10},
       {"value":"c","label":"Je me sens attaquée et je le montre","score":-3},
       {"value":"d","label":"Je promets de changer mais je continue pareil","score":-8,"redFlag":true}]'::jsonb, 1.2, 41),
    (qid, 'personality', 'Tu trouves plus facile de :', 'single_choice',
     '[{"value":"a","label":"Travailler en équipe","score":7},
       {"value":"b","label":"Travailler seule","score":5},
       {"value":"c","label":"Les deux selon le contexte","score":10},
       {"value":"d","label":"Diriger les autres","score":4}]'::jsonb, 1.0, 42),
    (qid, 'personality', 'À quel point penses-tu être patiente avec les clients difficiles ?', 'scale',
     '[{"min":1,"max":5,"labels":["Peu patiente","Très patiente"]}]'::jsonb, 1.1, 43)
  on conflict do nothing;

  -- Catégorie 5 : SÉRIEUX / FIABILITÉ (poids 1.3)
  insert into public.screening_questions (questionnaire_id, category, question_text, type, options, weight, sort_order) values
    (qid, 'seriousness', 'Tu es malade le matin de ton service. Tu fais quoi ?', 'single_choice',
     '[{"value":"a","label":"Je préviens la direction au moins 2h avant","score":10},
       {"value":"b","label":"Je préviens 30 min avant le début","score":4},
       {"value":"c","label":"Je ne préviens pas, je viendrai plus tard","score":-10,"redFlag":true},
       {"value":"d","label":"J envoie un message à un collègue","score":2}]'::jsonb, 1.3, 50),
    (qid, 'seriousness', 'Combien de jobs as-tu eu dans les 2 dernières années ?', 'single_choice',
     '[{"value":"a","label":"0-1","score":10},
       {"value":"b","label":"2","score":7},
       {"value":"c","label":"3-4","score":3},
       {"value":"d","label":"5+","score":-5,"redFlag":true}]'::jsonb, 1.2, 51),
    (qid, 'seriousness', 'Pourquoi voudrais-tu travailler chez CaftanRH ?', 'text_short',
     '[]'::jsonb, 1.0, 52),
    (qid, 'seriousness', 'Te projeter sur 2 ans dans le poste, c est :', 'single_choice',
     '[{"value":"a","label":"Tout à fait possible","score":10},
       {"value":"b","label":"Probable","score":7},
       {"value":"c","label":"Pas sûr","score":3},
       {"value":"d","label":"Non, je cherche court terme","score":-3}]'::jsonb, 1.1, 53)
  on conflict do nothing;

  -- Catégorie 6 : LANGUES (poids 1.3 - image premium)
  insert into public.screening_questions (questionnaire_id, category, question_text, question_subtitle, type, options, weight, sort_order) values
    (qid, 'lang_fr', 'Comment évalues-tu ton français à l oral et à l écrit ?', 'Important pour l image premium magasin', 'single_choice',
     '[{"value":"a","label":"Maternel ou bilingue","score":10},
       {"value":"b","label":"Très bon","score":8},
       {"value":"c","label":"Correct mais avec des fautes","score":4},
       {"value":"d","label":"Faible","score":-2}]'::jsonb, 1.3, 60),
    (qid, 'lang_fr', 'Écris une phrase pour accueillir une cliente :', null, 'text_short',
     '[]'::jsonb, 1.2, 61),
    (qid, 'lang_ar', 'Comprends-tu les chiffres en arabe (pour clientèle arabophone) ?', null, 'single_choice',
     '[{"value":"a","label":"Oui parfaitement","score":10},
       {"value":"b","label":"Oui de base","score":6},
       {"value":"c","label":"Pas vraiment","score":2}]'::jsonb, 1.0, 62),
    (qid, 'lang_en', 'Niveau d anglais à l oral ?', null, 'single_choice',
     '[{"value":"a","label":"Courant","score":10},
       {"value":"b","label":"Conversationnel","score":7},
       {"value":"c","label":"Basique","score":4},
       {"value":"d","label":"Nul","score":0}]'::jsonb, 0.7, 63)
  on conflict do nothing;

  -- Catégorie 7 : PONCTUALITÉ (poids 1.3)
  insert into public.screening_questions (questionnaire_id, category, question_text, type, options, weight, sort_order) values
    (qid, 'punctuality', 'Quand tu as un rendez-vous important, tu arrives :', 'single_choice',
     '[{"value":"a","label":"10-15 min en avance","score":10},
       {"value":"b","label":"Pile à l heure","score":8},
       {"value":"c","label":"Souvent 5 min en retard","score":-2},
       {"value":"d","label":"Toujours en retard","score":-10,"redFlag":true}]'::jsonb, 1.3, 70),
    (qid, 'punctuality', 'Tu rates ton bus / train pour aller au boulot. Tu fais quoi ?', 'single_choice',
     '[{"value":"a","label":"Je préviens la direction immédiatement","score":10},
       {"value":"b","label":"Je prends un taxi ou un Uber","score":8},
       {"value":"c","label":"Je préviens en arrivant","score":2},
       {"value":"d","label":"Je ne préviens pas","score":-8,"redFlag":true}]'::jsonb, 1.3, 71),
    (qid, 'punctuality', 'En 6 mois, combien de fois penses-tu être en retard de plus de 10 min ?', 'single_choice',
     '[{"value":"a","label":"Jamais","score":10},
       {"value":"b","label":"1-2 fois","score":7},
       {"value":"c","label":"3-5 fois","score":1},
       {"value":"d","label":"Plus de 5 fois","score":-5}]'::jsonb, 1.2, 72)
  on conflict do nothing;

  -- Catégorie 8 : DISPONIBILITÉ (poids 1.4)
  insert into public.screening_questions (questionnaire_id, category, question_text, question_subtitle, type, options, weight, sort_order) values
    (qid, 'availability', 'Travailler le samedi est :', 'Jour critique commerce détail', 'single_choice',
     '[{"value":"a","label":"OK, pas de problème","score":10},
       {"value":"b","label":"OK avec préavis","score":6},
       {"value":"c","label":"Difficile","score":-3},
       {"value":"d","label":"Impossible","score":-10,"redFlag":true}]'::jsonb, 1.4, 80),
    (qid, 'availability', 'Travailler les jours fériés (Aïd, Ramadan, ...) :', null, 'single_choice',
     '[{"value":"a","label":"OK avec rotation","score":10},
       {"value":"b","label":"OK exceptionnellement","score":5},
       {"value":"c","label":"Je préfère éviter","score":0},
       {"value":"d","label":"Non, jamais","score":-5}]'::jsonb, 1.3, 81),
    (qid, 'availability', 'As-tu des vacances déjà prévues dans les 6 prochains mois ?', null, 'text_short',
     '[]'::jsonb, 1.0, 82),
    (qid, 'availability', 'Tu peux travailler combien d heures par semaine maximum ?', null, 'numeric',
     '[]'::jsonb, 1.1, 83),
    (qid, 'availability', 'Quels jours sont TOTALEMENT indisponibles pour toi de manière récurrente ?', 'Cours, garde enfants, autre travail, etc.', 'multi_choice',
     '[{"value":"lun","label":"Lundi"},{"value":"mar","label":"Mardi"},{"value":"mer","label":"Mercredi"},
       {"value":"jeu","label":"Jeudi"},{"value":"ven","label":"Vendredi"},{"value":"sam","label":"Samedi"},
       {"value":"dim","label":"Dimanche"},{"value":"aucun","label":"Aucun, je suis flexible","score":10}]'::jsonb, 1.4, 84)
  on conflict do nothing;
end $$;
