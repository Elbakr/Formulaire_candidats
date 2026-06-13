-- Karim 2026-06-13 (Phase 1bis) : statut 'draft' = candidature COMMENCÉE mais
-- pas encore envoyée. L'assistant multi-écrans crée la candidature dès l'écran 1
-- (status='draft', visible RH pour le suivi des abandons) et synchronise la base
-- à chaque écran ; au dernier écran, finalize passe le statut 'draft' -> 'new'.
-- Additif et non destructif. Déjà appliquée à la prod (autocommit).

alter type application_status add value if not exists 'draft';
