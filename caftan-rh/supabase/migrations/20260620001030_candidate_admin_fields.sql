-- Karim 2026-07-03 : champs administratifs (secrétariat social) sur le lien de
-- pré-embauche candidat pré-validé (post-sélection = légal ici). nationality et
-- birth_place existent déjà sur candidates ; on ajoute les 3 manquants.
-- Finalités : niveau scolaire (aptitude fonction, CCT n°38), état civil + enfants
-- (précompte professionnel). Optionnels, jamais critères de tri.
alter table public.candidates
  add column if not exists education_level text,
  add column if not exists marital_status text,
  add column if not exists dependent_children integer;
