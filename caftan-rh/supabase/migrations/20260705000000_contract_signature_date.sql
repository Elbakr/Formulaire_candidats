-- Karim 2026-07-05 : DATE DE SIGNATURE explicite et VISIBLE sur le contrat.
-- Avant, la date « Fait à X, le … » était un <date-field> DocuSeal INVISIBLE dans
-- le rendu interne (aperçu / page contrat / PDF) : l'opérateur ne voyait aucune
-- date. Désormais la date est rendue en texte visible.
--
-- signature_date : date de signature affichée sur le contrat.
--   - NULL par défaut => le renderer retombe sur la date de GÉNÉRATION du contrat
--     (employee_contracts.prepared_at ?? created_at, tronquée en date).
--   - Renseignée => l'opérateur l'a fixée explicitement via le formulaire.
-- Additif, nullable : n'impacte aucun contrat existant.
alter table public.employee_contracts
  add column if not exists signature_date date;
