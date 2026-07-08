-- Karim 2026-07-08 : ACCOMPAGNEMENT — cadence RENOUVELLEMENT + rappel FIN DE CONTRAT.
--
-- Deux nouvelles familles de paliers, tracées dans la MÊME table worker_followups
-- (réutilisation : anti-doublon strict via unique (employee_id, milestone)) :
--
--   A. RENOUVELLEMENT (2ᵉ contrat signé et +) — série ancrée sur le DÉBUT du
--      contrat renouvelé le plus récent, AVANT la Phase 2 :
--        rnw_welcome (J0), rnw_5_1/2/3 (J+5/10/15), rnw_8_1/2/3 (J+23/31/39),
--        phase = 'renewal'. Ensuite la Phase 2 habituelle (p2_dayNN) reprend.
--
--   B. FIN DE CONTRAT — un rappel UNIQUE par contrat CDD (end_date non nulle),
--      envoyé quand end_date - aujourd'hui ∈ ]0,15] jours :
--        milestone = 'end_reminder_<contractId>', phase = 'end'.
--
-- La colonne `phase` est du TEXTE LIBRE (aucune contrainte CHECK) : les valeurs
-- 'renewal' et 'end' s'ajoutent aux 'p1'/'p2' existantes sans migration de schéma.
-- Cette migration est purement documentaire + idempotente (ré-exécutable).

comment on column public.worker_followups.milestone is
  'Palier d''accompagnement (unique par travailleur). Familles : w1_dayNN (Phase 1), p2_dayNN (Phase 2), rnw_welcome|rnw_5_x|rnw_8_x (renouvellement), end_reminder_<contractId> (rappel fin de contrat).';

comment on column public.worker_followups.phase is
  'Phase informative (texte libre) : p1 | p2 | renewal | end.';
