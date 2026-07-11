-- Karim 2026-07-11 : FIN du spam "Sync GF en panne" (faux positifs).
--
-- Le moniteur comparait le nombre BRUT d'entrées GF (avec doublons de
-- re-candidatures) au nombre de candidats UNIQUES -> gap structurel (~414) qui ne
-- se referme jamais. Diagnostic prouvé : 0 candidat perdu (1886 entrées = 1472
-- uniques + 414 re-candidatures = 1472 en base).
--
-- Correctif : on stocke le nombre d'entrées RÉELLEMENT récupérées au dernier sync
-- (`last_sync_fetched`) pour comparer DU COMPARABLE (entrées vs entrées), et le
-- nombre d'ERREURS RÉELLES (hors dédup bénigne). Le moniteur (gf-sync-health)
-- n'alerte plus que sur un vrai retard d'import ou de vraies erreurs.

alter table public.gf_settings add column if not exists last_sync_fetched integer;
alter table public.gf_settings add column if not exists last_sync_error_count integer not null default 0;
