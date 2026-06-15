-- Karim 2026-06-15 : ajoute la colonne custom_value à agent_learnings
-- Permet à l'agent de mémoriser une valeur libre saisie par l'utilisateur
-- (ex. "15" pour un seuil, "75" pour un %, texte libre pour une réponse non quantifiable).
-- La colonne chosen_option prend la valeur spéciale "custom" quand c'est une valeur libre.
-- À appliquer via le Tech Lead (ne pas appliquer automatiquement).

ALTER TABLE agent_learnings ADD COLUMN IF NOT EXISTS custom_value text;
