-- Karim 2026-07-05 : le candidat pré-validé reçoit, à la fin du formulaire
-- d'embauche, un mail RÉCAPITULATIF complet de ses données (+ indisponibilités)
-- avec deux actions : « Corriger mes infos » (même lien magique) et « Je confirme »
-- (relecture validée). Cette colonne trace l'horodatage de la confirmation.
--
-- dossier_confirmed_at : NULL tant que le candidat n'a pas cliqué « Je confirme ».
--   Renseignée => il a relu et validé son récapitulatif via le lien du mail.
-- Additif, nullable : n'impacte aucune fiche candidat existante.
alter table public.candidates
  add column if not exists dossier_confirmed_at timestamptz;
