-- Lot B1 : termes proposés éditables avant envoi de l'offre de renouvellement CDD.
-- Ces colonnes sont pré-remplies depuis la reco (heures contrat actuel / dates),
-- puis ajustées à la main par la RH avant envoi.
-- NE PAS APPLIQUER MANUELLEMENT — le Tech Lead applique cette migration.

ALTER TABLE cdd_renewal_recommendations
  ADD COLUMN IF NOT EXISTS proposed_weekly_hours numeric,
  ADD COLUMN IF NOT EXISTS proposed_start_date date,
  ADD COLUMN IF NOT EXISTS proposed_end_date date;
