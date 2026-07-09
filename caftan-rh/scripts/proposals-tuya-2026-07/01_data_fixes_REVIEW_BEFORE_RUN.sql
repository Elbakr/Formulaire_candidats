-- =====================================================================
-- PROPOSITIONS DE CORRECTION DE DONNEES — POINTAGE TUYA (2026-07-09)
-- NE PAS EXECUTER SANS VALIDATION DE KARIM. Data sensible = pointage reel.
-- Chaque bloc est independant. Lire, puis executer bloc par bloc.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BLOC A — Fermer les sessions "collees" (fausses presences).
-- Contexte : un IN sans OUT reste ouvert et l'employe apparait present a vie
-- (ex : Sarah Anvers, IN 2026-07-08 09:10, ouvert >25h). Le cron
-- tuya-auto-out / force-close-orphans doit normalement les fermer ; s'ils
-- ne tournent pas, on ferme manuellement ici.
--
-- Ce bloc insere un OUT source='auto_close' a IN + 2h30 (borne 23:00 locale)
-- pour CHAQUE session actuellement ouverte depuis > 18h. A adapter/verifier.
-- (Le trigger tg_prevent_double_clock_in autorise l'OUT car un IN est ouvert.)

-- 1) D'ABORD : verifier ce qui sera ferme (SELECT de controle)
WITH last_entry AS (
  SELECT DISTINCT ON (employee_id) employee_id, id, kind, occurred_at, site_id, shift_id
  FROM clock_entries ORDER BY employee_id, occurred_at DESC
)
SELECT le.employee_id, e.full_name, le.occurred_at AS in_at,
       round(extract(epoch FROM (now() - le.occurred_at))/3600, 1) AS hours_open
FROM last_entry le JOIN employees e ON e.id = le.employee_id
WHERE le.kind = 'in' AND le.occurred_at < now() - interval '18 hours'
ORDER BY le.occurred_at;

-- 2) ENSUITE (si la liste est correcte) : inserer les OUT estimes.
-- Decommenter pour executer.
-- WITH last_entry AS (
--   SELECT DISTINCT ON (employee_id) employee_id, id, kind, occurred_at, site_id, shift_id
--   FROM clock_entries ORDER BY employee_id, occurred_at DESC
-- ), stale AS (
--   SELECT le.* FROM last_entry le
--   WHERE le.kind = 'in' AND le.occurred_at < now() - interval '18 hours'
-- )
-- INSERT INTO clock_entries (employee_id, shift_id, site_id, kind, occurred_at,
--                            entry_method, source, auto_clocked_out, notes)
-- SELECT employee_id, shift_id, site_id, 'out',
--        LEAST(occurred_at + interval '2 hours 30 minutes',
--              date_trunc('day', occurred_at) + interval '21 hours'), -- ~23:00 Brussels
--        'auto_shift', 'auto_close', true,
--        'Fermeture manuelle session collee >18h (fix pointage 2026-07-09)'
-- FROM stale;


-- ---------------------------------------------------------------------
-- BLOC B — Assainir tuya_unmapped_slots : marquer resolved_at pour les slots
-- qui ont DESORMAIS un mapping numerique actif (evite les fausses alertes
-- "badge perdu / slot non mappe"). Sans risque (colonne d'audit uniquement).

UPDATE tuya_unmapped_slots u
SET resolved_at = now()
WHERE u.resolved_at IS NULL
  AND EXISTS (
    SELECT 1 FROM tuya_user_mapping m
    WHERE m.is_active
      AND m.tuya_device_id = u.tuya_device_id
      AND m.tuya_user_id = u.tuya_user_id
  );


-- ---------------------------------------------------------------------
-- BLOC C — (INFO, ne rien faire) Diagnostic des "invisibles au pointage".
-- Employes actifs dont AUCUN mapping actif n'a de slot numerique : ils sont
-- physiquement presents mais jamais reconnus par le poll (badges perdus).
-- Objectif : les faire badger puis mapper le slot numerique via /admin/tuya/logs.
SELECT e.full_name,
       count(*) FILTER (WHERE m.tuya_user_id IS NOT NULL) AS numeric_slots,
       count(*) FILTER (WHERE m.tuya_user_id IS NULL)     AS alpha_only,
       string_agg(DISTINCT coalesce(m.tuya_name, m.tuya_user_id_alpha), ', ') AS hints
FROM tuya_user_mapping m
JOIN employees e ON e.id = m.employee_id
WHERE m.is_active AND e.status = 'active'
GROUP BY e.full_name
HAVING count(*) FILTER (WHERE m.tuya_user_id IS NOT NULL) = 0
ORDER BY e.full_name;
