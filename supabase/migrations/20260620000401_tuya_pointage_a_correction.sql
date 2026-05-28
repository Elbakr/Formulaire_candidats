-- Karim 2026-05-24 : correction du mapping Pointage A.
--
-- Test fait par un collegue : pointage fingerprint a 13:41 sur le device
-- bf3984c8a5ba98b929cpgs (anciennement "Acces Platinum" cote cloud Tuya, mais
-- renomme "Pointage A" dans Smart Life par Karim).
--
-- Migration precedente (000400) avait deduit a tort que "Pointage A" etait
-- bfffc2848a716cdeeeglax ("Acces E") par elimination. C est bien
-- bf3984c8a5ba98b929cpgs qui est utilise pour le pointage des sites A/B/D.

-- Swap : bf3984c8a5ba98b929cpgs devient Pointage A
update tuya_devices set
  tuya_device_name = 'Pointage A',
  site_id = (select id from sites where code = 'A' limit 1),
  fallback_for_site_ids = array(select id from sites where code in ('B', 'D')),
  is_pointage = true,
  is_active = true,
  notes = 'Sert Sites A + B + D (fallback proximite). Anciennement nomme "Acces Platinum" cote cloud Tuya, renomme "Pointage A" dans Smart Life par Karim. Confirme par test collegue 2026-05-24 13:41.',
  updated_at = now()
where tuya_device_id = 'bf3984c8a5ba98b929cpgs';

-- Et bfffc2848a716cdeeeglax retourne dans la categorie "autres"
update tuya_devices set
  tuya_device_name = 'Acces E (autre)',
  site_id = null,
  fallback_for_site_ids = '{}',
  is_pointage = false,
  is_active = true,
  notes = 'Access Control LCD - dossier non-pointage CaftanRH. Anciennement deduit a tort comme "Pointage A", mais le vrai "Pointage A" est bf3984c8a5ba98b929cpgs.',
  updated_at = now()
where tuya_device_id = 'bfffc2848a716cdeeeglax';
