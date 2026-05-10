-- Module Pré-entretien (V1 écrit) — Caftan RH
-- Idempotent. Greffe les nouveaux statuts/valeurs d'enum + 3 tables (questions / instances / réponses)
-- + RLS + trigger qui met à jour applications.status quand un pré-entretien est envoyé/complété/décidé.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Étendre l'enum application_status avec les statuts pré-entretien
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_type where typname = 'application_status') then
    alter type application_status add value if not exists 'pre_interview_sent';
    alter type application_status add value if not exists 'pre_interview_done';
    alter type application_status add value if not exists 'shortlistable';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Étendre l'enum interview_type avec 'pre_screening' (V2 vidéo s'y greffera)
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_type where typname = 'interview_type') then
    alter type interview_type add value if not exists 'pre_screening';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Banque de questions (référentiel)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists pre_interview_questions (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  position_role text not null default 'all',          -- all | vendeur | gerant | gestionnaire
  language_code text not null default 'fr',
  prompt text not null,
  kind text not null default 'text',                  -- text | single_choice | multi_choice | scale_1_5
  choices jsonb,                                      -- pour single/multi_choice
  min_chars integer default 0,
  max_chars integer default 2000,
  is_required boolean not null default true,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_pre_q_role_active on pre_interview_questions (position_role, is_active, sort_order);

alter table pre_interview_questions enable row level security;

drop policy if exists pre_q_public_read on pre_interview_questions;
create policy pre_q_public_read on pre_interview_questions for select using (true);

drop policy if exists pre_q_rh_write on pre_interview_questions;
create policy pre_q_rh_write on pre_interview_questions for all using (is_rh()) with check (is_rh());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Instances de pré-entretien envoyées à un candidat
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists pre_interviews (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  position_role text not null default 'all',
  token text unique not null,
  language_code text not null default 'fr',
  sent_at timestamptz,
  expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'sent',                -- sent | started | completed | expired | discarded
  reviewer_id uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  decision text,                                      -- shortlist | reject | reserve
  decision_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pre_i_app on pre_interviews (application_id);
create index if not exists idx_pre_i_token on pre_interviews (token);
create index if not exists idx_pre_i_status on pre_interviews (status);
create index if not exists idx_pre_i_expires on pre_interviews (expires_at) where status in ('sent', 'started');

alter table pre_interviews enable row level security;

-- Manager+ peut lire les pré-entretiens. Le candidat passe par token public — pas via RLS auth.
drop policy if exists pre_i_manager_read on pre_interviews;
create policy pre_i_manager_read on pre_interviews for select using (is_manager());

drop policy if exists pre_i_rh_write on pre_interviews;
create policy pre_i_rh_write on pre_interviews for all using (is_rh()) with check (is_rh());

-- Le service-role (server actions, cron) bypass RLS naturellement.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Réponses (1 par couple instance/question, upsert-friendly)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists pre_interview_responses (
  id uuid primary key default uuid_generate_v4(),
  pre_interview_id uuid not null references pre_interviews(id) on delete cascade,
  question_id uuid not null references pre_interview_questions(id) on delete restrict,
  answer_text text,
  answer_choices jsonb,
  answer_scale integer,
  answered_at timestamptz not null default now(),
  unique (pre_interview_id, question_id)
);

create index if not exists idx_pre_r_instance on pre_interview_responses (pre_interview_id);

alter table pre_interview_responses enable row level security;

drop policy if exists pre_r_manager_read on pre_interview_responses;
create policy pre_r_manager_read on pre_interview_responses for select using (
  is_manager()
  or exists (
    select 1 from pre_interviews pi
    join applications a on a.id = pi.application_id
    join candidates c on c.id = a.candidate_id
    where pi.id = pre_interview_id and c.profile_id = auth.uid()
  )
);

drop policy if exists pre_r_rh_write on pre_interview_responses;
create policy pre_r_rh_write on pre_interview_responses for all using (is_rh()) with check (is_rh());

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Trigger : maintient applications.status en cohérence avec pre_interviews
--    - INSERT : application -> 'pre_interview_sent'
--    - UPDATE completed_at IS NOT NULL  -> 'pre_interview_done'
--    - UPDATE decision = 'shortlist'    -> 'shortlistable'
--    On caste depuis text : si la valeur n'existe pas dans l'enum on no-op silencieusement.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function trg_pre_interview_sync_app_status() returns trigger as $$
declare
  target_status text;
begin
  if tg_op = 'INSERT' then
    target_status := 'pre_interview_sent';
  elsif tg_op = 'UPDATE' then
    if new.decision = 'shortlist' and (old.decision is null or old.decision <> 'shortlist') then
      target_status := 'shortlistable';
    elsif new.completed_at is not null and old.completed_at is null then
      target_status := 'pre_interview_done';
    end if;
  end if;

  if target_status is not null then
    -- Vérifie que la valeur existe dans l'enum avant de l'écrire
    if exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'application_status' and e.enumlabel = target_status
    ) then
      update applications
      set status = target_status::application_status
      where id = new.application_id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_pi_sync_status_ins on pre_interviews;
create trigger trg_pi_sync_status_ins
  after insert on pre_interviews
  for each row execute function trg_pre_interview_sync_app_status();

drop trigger if exists trg_pi_sync_status_upd on pre_interviews;
create trigger trg_pi_sync_status_upd
  after update on pre_interviews
  for each row execute function trg_pre_interview_sync_app_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Realtime
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pre_interviews'
  ) then
    alter publication supabase_realtime add table pre_interviews;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pre_interview_responses'
  ) then
    alter publication supabase_realtime add table pre_interview_responses;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Seed de la banque de questions (idempotent via slug unique)
-- ─────────────────────────────────────────────────────────────────────────────

insert into pre_interview_questions (slug, position_role, language_code, prompt, kind, choices, min_chars, max_chars, is_required, sort_order)
values
  ('motivation_caftan',   'all', 'fr',
   'En quelques phrases : pourquoi souhaitez-vous rejoindre Caftan Factory ?',
   'text', null, 80, 800, true, 10),

  ('experience_boutique', 'all', 'fr',
   'Avez-vous déjà travaillé en boutique / vente / accueil clientèle ? Si oui, où et combien de temps ?',
   'text', null, 30, 600, true, 20),

  ('langues_parlees', 'all', 'fr',
   'Quelles langues parlez-vous au quotidien (fr / nl / en / ar / autre) et à quel niveau ?',
   'text', null, 10, 300, true, 30),

  ('disponibilite_dates', 'all', 'fr',
   'À partir de quelle date êtes-vous disponible pour commencer ? Avez-vous des dates d''indisponibilité connues (vacances, examens, autre engagement) ?',
   'text', null, 10, 400, true, 40),

  ('mobilite_magasins', 'all', 'fr',
   'Pouvez-vous vous déplacer entre nos boutiques bruxelloises (Schaerbeek / Anderlecht / Molenbeek) ?',
   'single_choice',
   '[{"value":"oui_toutes","label":"Oui, toutes les boutiques"},{"value":"oui_certaines","label":"Oui, certaines uniquement"},{"value":"non","label":"Non, je préfère un seul lieu"}]'::jsonb,
   0, 200, true, 50),

  ('situation_actuelle', 'all', 'fr',
   'Quelle est votre situation actuelle (emploi, études, demandeur d''emploi, autre) ?',
   'text', null, 5, 300, true, 60),

  ('contact_preference', 'all', 'fr',
   'Comment préférez-vous être recontacté(e) ? (téléphone, email, WhatsApp)',
   'single_choice',
   '[{"value":"phone","label":"Téléphone"},{"value":"email","label":"Email"},{"value":"whatsapp","label":"WhatsApp"}]'::jsonb,
   0, 80, false, 70),

  -- Spécifique vendeur
  ('vendeur_sens_contact', 'vendeur', 'fr',
   'Sur une échelle de 1 à 5, à quel point êtes-vous à l''aise pour aborder un client en boutique ?',
   'scale_1_5', null, 0, 0, true, 80),

  ('vendeur_horaires', 'vendeur', 'fr',
   'Êtes-vous disponible le samedi (jour de pointe en boutique) ? Quels sont vos créneaux préférés ?',
   'text', null, 5, 300, true, 90)
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Email templates (FR) pour le module — idempotent par primary key (slug)
-- ─────────────────────────────────────────────────────────────────────────────

insert into email_templates (slug, label, category, subject, body_html, needs_dates, needs_times, is_active)
values
  ('pre_interview_invite',
   'Invitation pré-entretien écrit',
   'pre_interview',
   'Pré-entretien — Caftan Factory',
   '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.7;max-width:600px">
<p>Bonjour {{firstname}},</p>
<p>Merci pour votre candidature chez <b>Caftan Factory</b>. Votre profil nous intéresse.</p>
<p>Avant un entretien physique, nous vous proposons un court <b>pré-entretien écrit</b> (5 à 10 minutes). Cela nous permet de mieux préparer notre rencontre.</p>
<p style="margin:20px 0;text-align:center">
  <a href="{{link}}" style="display:inline-block;background:#c8a96e;color:#1a1a0d;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">
    Répondre au pré-entretien
  </a>
</p>
<p style="font-size:12px;color:#666">Le lien est valable jusqu''au <b>{{deadline}}</b>. Vos réponses sont sauvegardées automatiquement, vous pouvez revenir plus tard.</p>
<p>{{custom}}</p>
<hr style="border:none;border-top:1px solid #e8e6e0;margin:14px 0">
<p style="font-size:13px;margin:0">Cordialement,<br><b>L''équipe RH — {{org_name}}</b></p>
</div>',
   false, false, true),

  ('pre_interview_relance',
   'Relance pré-entretien J+3',
   'pre_interview',
   'Petit rappel — votre pré-entretien Caftan Factory',
   '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.7;max-width:600px">
<p>Bonjour {{firstname}},</p>
<p>Nous n''avons pas encore reçu vos réponses au pré-entretien. Le lien reste actif jusqu''au <b>{{deadline}}</b>.</p>
<p style="margin:20px 0;text-align:center">
  <a href="{{link}}" style="display:inline-block;background:#c8a96e;color:#1a1a0d;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">
    Répondre maintenant (5 min)
  </a>
</p>
<p>Si vous n''êtes plus intéressé(e), vous pouvez simplement ignorer ce message.</p>
<hr style="border:none;border-top:1px solid #e8e6e0;margin:14px 0">
<p style="font-size:13px;margin:0">Cordialement,<br><b>L''équipe RH — {{org_name}}</b></p>
</div>',
   false, false, true),

  ('pre_interview_reserve',
   'Mise en réserve (pré-entretien non complété)',
   'pre_interview',
   'Votre candidature — Caftan Factory',
   '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.7;max-width:600px">
<p>Bonjour {{firstname}},</p>
<p>Le délai pour répondre au pré-entretien étant dépassé, nous mettons votre candidature <b>en réserve</b>.</p>
<p>Si votre situation a changé et que vous souhaitez relancer le processus, répondez simplement à cet email — nous serons heureux de vous renvoyer le lien.</p>
<hr style="border:none;border-top:1px solid #e8e6e0;margin:14px 0">
<p style="font-size:13px;margin:0">Cordialement,<br><b>L''équipe RH — {{org_name}}</b></p>
</div>',
   false, false, true)
on conflict (slug) do nothing;
