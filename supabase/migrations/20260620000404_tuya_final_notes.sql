-- Karim 2026-05-24 : notes definitives sur le mapping device -> site
-- apres validation systematique par Karim.
--
-- Confirmations Karim :
--   - Selma Maïssa : Site E (utilise Pointage A occasionnellement)
--   - Souad El Aissaouy : Site E
--   - Keltoum El Mrabet : Site E, surnom "Karima" sur Pointage E
--   - Ibtissem Benoukhita : Site D, mais pointe via Pointage A (fallback)
--
-- Devices definitifs :
--   - bfd90b87c696ead286zzxm = Pointage A (Sites A + B + D fallback)
--   - bfffc2848a716cdeeeglax = Pointage E (Site E)
--   - bf668eaa15b73d5f56nisa = Pointage C et F (Anvers, futur)
--   - bf82afe3706630c4ff2mtp = Pointage ElectroZeyn (hors-scope)
--   - bf3984c8a5ba98b929cpgs = Acces Platinum (hors-scope)

update tuya_devices set
  notes = E'Pointage A : Sites A + B + D (fallback). Employees CaftanRH attendues : salima Alaoui (= "salma"), Lina 2 El Bertitan (= "lina2"), Ibtissem Benoukhita (= "ibtissam"), Hafsa Imachaal (= "Hafida"), Omaima Ouahi (= "Omaima"). Sanae Asaidi non enrôlée encore. Selma/Souad/Keltoum y ont aussi des empreintes (pointage occasionnel).',
  updated_at = now()
where tuya_device_id = 'bfd90b87c696ead286zzxm';

update tuya_devices set
  notes = E'Pointage E : Site E (118 chaussee de Gand). Employees CaftanRH attendues : Keltoum El Mrabet (surnom intime "Karima" sur Tuya), Souad El Aissaouy (= "Souad"), Selma Maïssa (probablement "selma" ailleurs). Autres noms enrôlés : Kawtar/Ikram/fatima/asia + admins (Z/V/Y/X/ahmed/haj/proximus).',
  updated_at = now()
where tuya_device_id = 'bfffc2848a716cdeeeglax';
