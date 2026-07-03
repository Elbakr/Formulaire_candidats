-- Karim 2026-07-03 : lien dynamique de PRÉ-EMBAUCHE pour un candidat pré-validé
-- (hors formulaire de candidature). Le candidat s'auto-enregistre via le même
-- formulaire /contract-info (auto-save), en choisissant étudiant/non-étudiant.
--
-- On rend le token contract_info_tokens rattachable à un CANDIDAT (pas seulement
-- un employé), et on ajoute au candidat les quelques champs secrétariat social
-- absents (statut étudiant + transport). Les autres champs (nrn, iban, adresse,
-- date de naissance...) existent déjà sur candidates (cf. promote_application_to_employee).

alter table public.contract_info_tokens
  add column if not exists candidate_id uuid references public.candidates(id) on delete cascade;

-- Le token peut désormais viser un candidat OU un employé : employee_id devient nullable.
alter table public.contract_info_tokens
  alter column employee_id drop not null;

alter table public.candidates
  add column if not exists is_student boolean,
  add column if not exists transport_type text,
  add column if not exists transport_frequency text,
  add column if not exists transport_price numeric(10, 2),
  add column if not exists worker_field_submissions jsonb,
  add column if not exists prevalidated boolean not null default false;

comment on column public.candidates.prevalidated is
  'true = candidat pré-validé créé hors formulaire (lien de pré-embauche). is_student = déclaration étudiant/non-étudiant.';
