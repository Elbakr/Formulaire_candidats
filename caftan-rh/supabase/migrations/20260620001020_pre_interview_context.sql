-- Pré-entretien : distinction de CONTEXTE (screening vs onboarding) — Caftan RH
-- Idempotent.
--
-- Métier : le MÊME module pre_interviews sert désormais deux phases très
-- différentes :
--   * 'screening'  = questionnaire de SÉLECTION envoyé aux candidats non encore
--                    validés (comportement historique, INCHANGÉ).
--   * 'onboarding' = mini-questionnaire d'ACCUEIL envoyé au travailleur DÉJÀ
--                    embauché, juste après la signature du contrat
--                    (worker-welcome-questionnaire.ts). Ton accueillant,
--                    tutoiement, orienté « mieux te connaître / bien démarrer »,
--                    JAMAIS de questions de sélection.
--
-- On ajoute la colonne `context` sur les instances ET sur la banque de
-- questions, puis on seed un jeu de questions dédié 'onboarding' (FR + NL).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Colonne context (défaut 'screening' -> aucun impact sur l'existant)
-- ─────────────────────────────────────────────────────────────────────────────

alter table pre_interviews
  add column if not exists context text not null default 'screening';

alter table pre_interview_questions
  add column if not exists context text not null default 'screening';

create index if not exists idx_pre_q_context_role_active
  on pre_interview_questions (context, position_role, is_active, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Seed du jeu de questions ONBOARDING (idempotent via slug unique)
--    Bilingue : lignes 'fr' + 'nl' (mêmes sort_order, slugs distincts).
--    Ton : tutoiement, accueil d'une personne DÉJÀ embauchée. AUCUNE question
--    de sélection (pas de « pourquoi vous recruter », prétentions, etc.).
-- ─────────────────────────────────────────────────────────────────────────────

insert into pre_interview_questions
  (slug, context, position_role, language_code, prompt, kind, choices, min_chars, max_chars, is_required, sort_order)
values
  -- FR ----------------------------------------------------------------------
  ('onb_langues', 'onboarding', 'all', 'fr',
   'Quelles langues parles-tu au quotidien, et à quel niveau ? (par ex. français courant, néerlandais notions, arabe langue maternelle…)',
   'text', null, 5, 300, true, 10),

  ('onb_transport', 'onboarding', 'all', 'fr',
   'Comment comptes-tu te rendre au travail le plus souvent ?',
   'single_choice',
   '[{"value":"voiture","label":"En voiture"},{"value":"tec","label":"En transports en commun"},{"value":"velo","label":"À vélo / trottinette"},{"value":"pied","label":"À pied"},{"value":"covoiturage","label":"En covoiturage"},{"value":"autre","label":"Autrement"}]'::jsonb,
   0, 100, true, 20),

  ('onb_trajet', 'onboarding', 'all', 'fr',
   'Combien de temps de trajet environ, porte à porte ?',
   'single_choice',
   '[{"value":"lt15","label":"Moins de 15 min"},{"value":"15_30","label":"15 à 30 min"},{"value":"30_45","label":"30 à 45 min"},{"value":"45_60","label":"45 min à 1 h"},{"value":"gt60","label":"Plus d''1 h"}]'::jsonb,
   0, 60, false, 25),

  ('onb_dispos', 'onboarding', 'all', 'fr',
   'As-tu des disponibilités récurrentes ou des contraintes qu''on devrait connaître pour organiser tes horaires ? (cours, garde d''enfants, autre engagement, jours qui t''arrangent…)',
   'text', null, 5, 500, true, 30),

  ('onb_taille', 'onboarding', 'all', 'fr',
   'Quelle est ta taille de vêtement, pour préparer ta tenue de travail ?',
   'single_choice',
   '[{"value":"xs","label":"XS"},{"value":"s","label":"S"},{"value":"m","label":"M"},{"value":"l","label":"L"},{"value":"xl","label":"XL"},{"value":"xxl","label":"XXL"},{"value":"plus_tard","label":"Je préciserai plus tard"}]'::jsonb,
   0, 40, false, 40),

  ('onb_urgence', 'onboarding', 'all', 'fr',
   'En cas d''urgence, qui pouvons-nous contacter ? Indique le nom, le lien (parent, conjoint, ami…) et un numéro de téléphone.',
   'text', null, 5, 300, true, 50),

  ('onb_experience', 'onboarding', 'all', 'fr',
   'Y a-t-il une expérience, une compétence ou un petit talent qui pourrait t''être utile dans ton poste ? (langues, vente, retouches, réseaux sociaux, caisse…)',
   'text', null, 0, 500, false, 60),

  ('onb_comm', 'onboarding', 'all', 'fr',
   'Comment préfères-tu qu''on te contacte au quotidien ? (plusieurs choix possibles)',
   'multi_choice',
   '[{"value":"phone","label":"Téléphone"},{"value":"sms","label":"SMS"},{"value":"whatsapp","label":"WhatsApp"},{"value":"email","label":"Email"}]'::jsonb,
   0, 80, true, 70),

  ('onb_mot_libre', 'onboarding', 'all', 'fr',
   'Un dernier mot ? Dis-nous ce qu''on devrait savoir pour bien t''accueillir (tes préférences, ce qui te motive, une info utile…). Champ libre 😊',
   'text', null, 0, 600, false, 80),

  -- NL ----------------------------------------------------------------------
  ('onb_langues_nl', 'onboarding', 'all', 'nl',
   'Welke talen spreek je dagelijks, en op welk niveau? (bv. Frans vloeiend, Nederlands basiskennis, Arabisch moedertaal…)',
   'text', null, 5, 300, true, 10),

  ('onb_transport_nl', 'onboarding', 'all', 'nl',
   'Hoe kom je meestal naar het werk?',
   'single_choice',
   '[{"value":"voiture","label":"Met de auto"},{"value":"tec","label":"Met het openbaar vervoer"},{"value":"velo","label":"Met de fiets / step"},{"value":"pied","label":"Te voet"},{"value":"covoiturage","label":"Carpoolen"},{"value":"autre","label":"Anders"}]'::jsonb,
   0, 100, true, 20),

  ('onb_trajet_nl', 'onboarding', 'all', 'nl',
   'Hoe lang duurt je rit ongeveer, van deur tot deur?',
   'single_choice',
   '[{"value":"lt15","label":"Minder dan 15 min"},{"value":"15_30","label":"15 tot 30 min"},{"value":"30_45","label":"30 tot 45 min"},{"value":"45_60","label":"45 min tot 1 u"},{"value":"gt60","label":"Meer dan 1 u"}]'::jsonb,
   0, 60, false, 25),

  ('onb_dispos_nl', 'onboarding', 'all', 'nl',
   'Heb je vaste beschikbaarheden of verplichtingen waarmee we rekening moeten houden voor je uurrooster? (lessen, kinderopvang, andere verbintenis, dagen die jou goed uitkomen…)',
   'text', null, 5, 500, true, 30),

  ('onb_taille_nl', 'onboarding', 'all', 'nl',
   'Wat is je kledingmaat, om je werkkledij klaar te maken?',
   'single_choice',
   '[{"value":"xs","label":"XS"},{"value":"s","label":"S"},{"value":"m","label":"M"},{"value":"l","label":"L"},{"value":"xl","label":"XL"},{"value":"xxl","label":"XXL"},{"value":"plus_tard","label":"Ik geef het later door"}]'::jsonb,
   0, 40, false, 40),

  ('onb_urgence_nl', 'onboarding', 'all', 'nl',
   'Wie mogen we in geval van nood contacteren? Geef de naam, de band (ouder, partner, vriend…) en een telefoonnummer.',
   'text', null, 5, 300, true, 50),

  ('onb_experience_nl', 'onboarding', 'all', 'nl',
   'Is er een ervaring, vaardigheid of talent dat je van pas kan komen in je functie? (talen, verkoop, herstellingen, sociale media, kassa…)',
   'text', null, 0, 500, false, 60),

  ('onb_comm_nl', 'onboarding', 'all', 'nl',
   'Hoe word je het liefst gecontacteerd in het dagelijks leven? (meerdere keuzes mogelijk)',
   'multi_choice',
   '[{"value":"phone","label":"Telefoon"},{"value":"sms","label":"Sms"},{"value":"whatsapp","label":"WhatsApp"},{"value":"email","label":"E-mail"}]'::jsonb,
   0, 80, true, 70),

  ('onb_mot_libre_nl', 'onboarding', 'all', 'nl',
   'Nog een laatste woordje? Vertel ons wat we moeten weten om je goed te onthalen (jouw voorkeuren, wat jou motiveert, nuttige info…). Vrij veld 😊',
   'text', null, 0, 600, false, 80)
on conflict (slug) do nothing;
