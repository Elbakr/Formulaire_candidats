-- =====================================================================
-- PROPOSITION D'ARCHITECTURE — MAPPING TUYA DURABLE (2026-07-09)
-- CHANGEMENT DE SCHEMA. NE PAS APPLIQUER SANS ACCORD EXPLICITE DE KARIM.
-- (Regle projet : ne jamais changer l'architecture sans demander d'abord.)
--
-- OBJECTIF : rendre le mapping badge Tuya <-> employe STABLE et MULTI-SLOT,
-- pour arreter le "je dois re-mapper certains travailleurs a chaque fois".
--
-- CAUSE RACINE (prouvee sur donnees) :
--   * Le poll resout un badge par le SLOT NUMERIQUE local du terminal
--     (tuya_user_id, ex "16"). Ce numero N'EST PAS stable : a chaque
--     re-enrolement d'empreinte (doigt use, mauvaise lecture), le terminal
--     attribue un NOUVEAU slot. Ex reel : 1 employe a 5 slots (16,17,18,20,22)
--     sur le meme terminal ; seuls 16/20 sont mappes -> les autres taps sont
--     perdus, et l'employe doit etre re-mappe.
--   * La contrainte UNIQUE (tuya_device_id, employee_id, direction) FORCE
--     un seul slot par (employe, direction) : re-mapper un slot drifte ECRASE
--     l'ancien au lieu de l'ajouter. Le modele "2 empreintes IN/OUT" est en
--     plus devenu VESTIGIAL (le poll infere IN/OUT par etat, pas par direction).
--
-- FIX DURABLE : autoriser PLUSIEURS slots numeriques actifs par (device, employe)
-- et garantir qu'un slot appartient a UN seul employe. On cle sur le slot,
-- pas sur la direction.
-- =====================================================================

BEGIN;

-- 1) Un slot physique = un seul employe (empeche les collisions / doublons).
--    (Pre-check : aucun doublon (device, slot) constate au 2026-07-09.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tuya_mapping_device_slot
  ON tuya_user_mapping (tuya_device_id, tuya_user_id)
  WHERE tuya_user_id IS NOT NULL AND is_active;

-- 2) Retirer la contrainte qui force 1 slot par (employe, direction) et
--    provoque l'ecrasement lors d'un re-enrolement.
ALTER TABLE tuya_user_mapping
  DROP CONSTRAINT IF EXISTS tuya_user_mapping_unique_emp_dev_dir;

-- 3) 'direction' devient purement indicatif (le poll infere IN/OUT par etat).
--    On la garde pour l'audit, mais elle n'est plus une cle.

COMMIT;

-- =====================================================================
-- COTE CODE (a faire APRES cette migration, si approuvee) :
--   * quickEnrollAction / addMappingAction / createEmployeeAndEnrollAction :
--       remplacer onConflict "tuya_device_id,employee_id,direction"
--       par onConflict "tuya_device_id,tuya_user_id"
--       => re-mapper un slot drifte AJOUTE un slot au lieu d'ecraser l'ancien.
--   * addFingerprintMappingAction : deja multi-slot (insert par slot) -> OK,
--       il n'echouera plus sur la contrainte (emp,direction).
--   * Le poll (processTuyaEvents) resout deja par (device, tuya_user_id) et
--       itere TOUS les mappings actifs -> multi-slot deja supporte en lecture.
--       Aucun changement de lecture necessaire.
--
-- BENEFICE : un employe peut cumuler ses anciens ET nouveaux slots ; un
-- re-enrolement n'oblige plus a re-mapper (on AJOUTE le nouveau slot en 1 clic,
-- l'ancien reste valide). Fin de la churn de mapping.
-- =====================================================================
