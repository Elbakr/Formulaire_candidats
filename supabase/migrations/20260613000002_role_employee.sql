-- Karim 2026-06-13 (Phase 2 cycle de vie) : nouveau rôle 'employee'.
-- Avant, un embauché gardait role='candidate' ; un employé n'était identifié
-- que par la présence d'une ligne `employees`. On introduit un rôle propre,
-- attribué A LA SIGNATURE du contrat (cf. src/lib/employee-activation.ts).
--
-- Additif et NON destructif : les comptes existants gardent leur rôle actuel.
-- Le routage (resolveHome) continue de traiter un employé encore en 'candidate'
-- correctement (fiche employees présente -> /me). Les helpers RLS
-- is_admin/is_rh/is_manager n'incluent PAS 'employee' : aucun privilège staff
-- accordé. Déjà appliquée à la prod.

alter type app_role add value if not exists 'employee';
