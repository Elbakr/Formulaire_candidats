-- Karim 2026-05-24 : confirmation definitive du mapping apres recherche des
-- noms d employees CaftanRH Site A sur l API Tuya.
--
-- Karim a confirme que les employees Site A sont : salima Alaoui, Lina 2
-- (El Bertitan), Ibtissem, Sanae (Asaidi), Hafsa, Omaima.
--
-- Recherche API : "salma", "lina2", "ibtissam", "Hafida", "Omaima" sont TOUS
-- enroles sur bfd90b87c696ead286zzxm (qu on appelait Pointage E par erreur).
-- C est donc le VRAI Pointage A.
--
-- L autre device bfffc2848a716cdeeeglax (avec Karima, Souad, Kawtar, Ikram,
-- fatima, asia) est probablement Pointage E.

-- 1. bfd90b87c696ead286zzxm -> Pointage A
update tuya_devices set
  tuya_device_name = 'Pointage A',
  site_id = (select id from sites where code = 'A' limit 1),
  fallback_for_site_ids = array(select id from sites where code in ('B', 'D')),
  is_pointage = true,
  is_active = true,
  notes = 'Sert Sites A + B + D (fallback proximite). Employees Site A : salima, Lina2, Ibtissem, Sanae, Hafsa, Omaima.',
  updated_at = now()
where tuya_device_id = 'bfd90b87c696ead286zzxm';

-- 2. bfffc2848a716cdeeeglax -> Pointage E
update tuya_devices set
  tuya_device_name = 'Pointage E',
  site_id = (select id from sites where code = 'E' limit 1),
  fallback_for_site_ids = '{}',
  is_pointage = true,
  is_active = true,
  notes = 'Site E (118 chaussee de Gand). Employees enroles : Karima, Souad, Kawtar, Ikram, fatima, asia + admins.',
  updated_at = now()
where tuya_device_id = 'bfffc2848a716cdeeeglax';

-- 3. Mappings existants (Keltoum, Souad El Aissaouy, Selma Maissa sur l ancien
--    bfd90b87c... = nouveau "Pointage A") - les flags direction seront ignores
--    avec la nouvelle logique d alternance auto. On garde les mappings tels quels.
--    Si Karim veut les corriger, c est via /admin/tuya/users.

-- 4. Reset sync_state pour forcer un re-poll complet
delete from tuya_sync_state;

-- 5. Supprime les clock_entries source='tuya' existantes (mauvais site_id
--    car le device etait classe Site E au lieu de Site A)
delete from clock_entries where source = 'tuya';
