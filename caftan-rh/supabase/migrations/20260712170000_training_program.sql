-- Karim 2026-07-12 : PROGRAMME DE FORMATION « grand manuel » gamifié sur ≤ 30 jours
-- pour toute nouvelle recrue. 1re section jour 1 à 9h, puis chaque jour à 9h (ou à la
-- demande via « hâte d'apprendre »). Examens CRESCENDO tous les 5 envois. Mesure dès
-- le jour 1 (temps de lecture = profilage + motivation) alimentant le score. Chaque
-- résultat d'examen est rapporté à l'admin par mail. Reco de renouvellement à J+30.

-- ── Curriculum : modules ordonnés (leçons + examens) ─────────────────────────
create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  seq int not null unique,                 -- ordre d'envoi (1..N)
  kind text not null default 'lesson',     -- 'lesson' | 'exam'
  category text,                           -- thème (repris du guide)
  title_fr text not null,
  title_nl text,
  body_fr text not null default '',        -- contenu de la section (ton ludique)
  body_nl text,
  exam_level int,                          -- niveau crescendo (1..) si kind='exam'
  questions jsonb,                         -- [{q_fr,q_nl,choices_fr[],choices_nl[],correct}]
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Inscription d'un travailleur au programme ────────────────────────────────
create table if not exists public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  token text not null unique,              -- lien public durable /former/<token>
  started_on date not null,                -- 1er jour (= start_date ou aujourd'hui)
  rhythm text not null default 'daily',    -- 'daily' (1/jour) | 'spread30' (étalé) — CHOIX travailleur
  current_seq int not null default 0,      -- dernière section ENVOYÉE
  next_send_at timestamptz,                -- prochaine section programmée (9h)
  status text not null default 'active',   -- active | done | paused
  created_at timestamptz not null default now(),
  unique(employee_id)
);

-- ── Événements par section : envoi, ouverture, TEMPS DE LECTURE, action ──────
create table if not exists public.training_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  module_seq int not null,
  sent_at timestamptz,
  opened_at timestamptz,
  confirmed_at timestamptz,
  reading_seconds int,                     -- temps ouverture->confirmation (profilage)
  action text,                             -- 'eager' (hâte d'apprendre) | 'done' | null
  created_at timestamptz not null default now(),
  unique(employee_id, module_seq)
);

-- ── Résultats d'examens (crescendo) ──────────────────────────────────────────
create table if not exists public.training_exam_results (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  module_seq int not null,
  level int,
  score int,
  total int,
  answers jsonb,
  taken_at timestamptz not null default now()
);

-- ── Score de formation par travailleur (motivation + profil lecture + examens) ─
create table if not exists public.training_scores (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  motivation int not null default 0,       -- réactivité, 'hâte d'apprendre', confirmations
  reading_profile int not null default 0,  -- profil temps de lecture (0..100)
  exam_avg numeric not null default 0,     -- moyenne examens (0..100)
  overall int not null default 0,          -- score global (0..100)
  coherence int,                           -- adéquation temps-lecture <-> examens
  updated_at timestamptz not null default now()
);

create index if not exists training_enroll_next_idx on public.training_enrollments (next_send_at) where status = 'active';
create index if not exists training_events_emp_idx on public.training_events (employee_id);
