-- Karim 2026-05-24 : RE-correction du mapping Pointage A apres verification
-- des noms enroles sur chaque device via l API Tuya.
--
-- Le device "Pointage A" est en realite bfffc2848a716cdeeeglax (qui contient
-- les noms des employees CaftanRH : Karima, Souad, Kawtar, Ikram, fatima, asia).
-- Le device bf3984c8a5ba98b929cpgs contient des noms du DEPOT Platinum
-- (ahmed, Issam, Ali Addas, omaima, ZAKARIA) qui ne sont PAS des employes RH.
--
-- Migration 401 avait swappe les 2 a tort en se basant sur un test password
-- a 13:41 (qui etait en fait un employee du depot Platinum).

-- 1. bfffc2848a716cdeeeglax (anciennement "Acces E (autre)") -> Pointage A
update tuya_devices set
  tuya_device_name = 'Pointage A',
  site_id = (select id from sites where code = 'A' limit 1),
  fallback_for_site_ids = array(select id from sites where code in ('B', 'D')),
  is_pointage = true,
  is_active = true,
  notes = 'Sert Sites A + B + D (fallback proximite). 13 utilisateurs enroles dont employees RH : Karima, Souad, Kawtar, Ikram, fatima, asia.',
  updated_at = now()
where tuya_device_id = 'bfffc2848a716cdeeeglax';

-- 2. bf3984c8a5ba98b929cpgs -> Acces Platinum (hors-scope CaftanRH)
update tuya_devices set
  tuya_device_name = 'Acces Platinum',
  site_id = null,
  fallback_for_site_ids = '{}',
  is_pointage = false,
  is_active = true,
  notes = 'Controle d acces depot Platinum - HORS-SCOPE CaftanRH. 5 utilisateurs enroles (ahmed, Issam, Ali Addas, omaima, ZAKARIA) - employes du depot, pas des boutiques RH.',
  updated_at = now()
where tuya_device_id = 'bf3984c8a5ba98b929cpgs';

-- 3. Supprime les mappings erronés sur bf3984c8a5ba98b929cpgs (Acces Platinum
--    n est plus is_pointage, ces mappings n ont plus de sens)
delete from tuya_user_mapping
where tuya_device_id = 'bf3984c8a5ba98b929cpgs';

-- 4. Supprime les clock_entries source='tuya' lies a bf3984c8a5ba98b929cpgs
--    (donnees erronees : ce n etait pas le bon device)
delete from clock_entries
where source = 'tuya' and tuya_device_id = 'bf3984c8a5ba98b929cpgs';

-- 5. Reset le sync_state pour ce device (sera regenere au prochain poll)
delete from tuya_sync_state where id = 'bf3984c8a5ba98b929cpgs';
