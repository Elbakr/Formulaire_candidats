-- Karim 2026-06-15 : colonne payslip_sender_map dans org_settings
-- Permet à l'admin d'ajouter des expéditeurs autorisés (email/nom → employeur)
-- sans toucher au code. Tableau JSONB : [{ pattern, employer }]
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS payslip_sender_map jsonb;
