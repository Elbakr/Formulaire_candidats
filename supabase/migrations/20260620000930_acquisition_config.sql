-- Lot C4 : panneau de configuration acquisition.
-- Stocke les paramètres (seuil de score d'embauche, délais de relance, fenêtre
-- de planification d'entretien) dans une colonne JSON dédiée d'org_settings.
-- NE PAS APPLIQUER MANUELLEMENT — le Tech Lead applique cette migration.

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS acquisition_config jsonb;
