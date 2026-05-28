-- Karim 2026-05-24 : DEFINITIF apres re-link du compte Smart Life qui possede
-- le device "Pointage A". Le vrai Pointage A est bfb90ad2054971aefatjkh.
--
-- Mapping final :
--   bfb90ad2054971aefatjkh  -> Pointage A (Site A + fallback B/D)  [NOUVEAU]
--   bfd90b87c696ead286zzxm  -> Pointage E (Site E)                  [conserve mappings]
--   bfffc2848a716cdeeeglax  -> Acces E porte d entree (hors-pointage)
--   bf668eaa15b73d5f56nisa  -> Pointage C et F (Anvers, futur)
--   bf82afe3706630c4ff2mtp  -> Pointage ElectroZeyn (hors-scope)
--   bf3984c8a5ba98b929cpgs  -> Acces Platinum (hors-scope)
--   + 4 SmartLocks (ms) hors-pointage

-- 1. Insert le nouveau device Pointage A
insert into tuya_devices (
  tuya_device_id, tuya_device_name, category, is_active, is_pointage,
  site_id, fallback_for_site_ids, notes
)
values (
  'bfb90ad2054971aefatjkh',
  'Pointage A',
  'mk',
  true,
  true,
  (select id from sites where code = 'A' limit 1),
  array(select id from sites where code in ('B', 'D')),
  'Pointage A officiel - Site A + fallback B/D. Linke au projet dev Tuya le 2026-05-24 apres avoir re-linke le bon compte Smart Life. Employees Site A : Omaima, Lina 2, Salima, Ibtissem, Sanae, Hafsa, Salmane, Ilham + Site B/D via fallback.'
)
on conflict (tuya_device_id) do update set
  tuya_device_name = excluded.tuya_device_name,
  is_active = true,
  is_pointage = true,
  site_id = excluded.site_id,
  fallback_for_site_ids = excluded.fallback_for_site_ids,
  notes = excluded.notes,
  updated_at = now();

-- 2. bfd90b87c696ead286zzxm = Pointage E (Site E)
update tuya_devices set
  tuya_device_name = 'Pointage E',
  site_id = (select id from sites where code = 'E' limit 1),
  fallback_for_site_ids = '{}',
  is_pointage = true,
  is_active = true,
  notes = 'Pointage E officiel - Site E (118 chaussee de Gand). Employees : Keltoum El Mrabet, Souad El Aissaouy, Selma Maissa.',
  updated_at = now()
where tuya_device_id = 'bfd90b87c696ead286zzxm';

-- 3. bfffc2848a716cdeeeglax = Acces E porte d entree (hors-pointage)
update tuya_devices set
  tuya_device_name = 'Acces E (porte entree)',
  site_id = null,
  fallback_for_site_ids = '{}',
  is_pointage = false,
  is_active = true,
  notes = 'Porte d entree Site E - acces fonctionnel, HORS-SCOPE pointage CaftanRH. Empreintes y sont enrolees pour ouvrir la porte, pas pour pointer.',
  updated_at = now()
where tuya_device_id = 'bfffc2848a716cdeeeglax';

-- 4. Reset sync state des devices pointage pour permettre un backfill propre
delete from tuya_sync_state where id in ('bfb90ad2054971aefatjkh', 'bfd90b87c696ead286zzxm');
