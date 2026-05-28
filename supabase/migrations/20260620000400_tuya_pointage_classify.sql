-- Karim 2026-05-24 : classification des 9 terminaux Tuya selon mapping fourni.
--
-- La table tuya_devices existe deja (migration 380). On l etend avec les
-- colonnes manquantes pour gerer le pointage CaftanRH (vs autres devices) :
--   - is_pointage : true = utilise pour le pointage employes
--   - online : statut Tuya
--   - notes : commentaire libre
--   - product_name, category : metadata pour distinguer LCD (mk) vs SmartLock (ms)
--   - updated_at : audit
-- Drop NOT NULL sur site_id : un device peut etre enregistre sans site assigne
-- (cas des devices non-pointage type SmartLocks, ou en attente de deploiement).
--
-- Mapping definitif (apres elimination par Karim) :
--   POINTAGE CaftanRH (is_pointage=true) :
--     - bfffc2848a716cdeeeglax "Pointage A"        -> Site A + fallback B/D
--       (ce device etait nomme "Acces E" mais Karim l a renomme dans Smart Life)
--     - bfd90b87c696ead286zzxm "Pointage E"        -> Site E (118 chaussee de Gand)
--     - bf668eaa15b73d5f56nisa "Pointage C et F"   -> Anvers (deploiement futur, site_id=null)
--
--   HORS POINTAGE (is_pointage=false) :
--     - bf82afe3706630c4ff2mtp "Pointage ElectroZeyn"  : autre business
--     - bf3984c8a5ba98b929cpgs "Acces Platinum"        : controle d acces depot
--     - 60422568bcff4d095350   "Acces Bureau A"        : SmartLock bureau
--     - bf7a05702d14cf4b6aulkq "Platinum Depot"        : SmartLock depot
--     - bfd6a211e7b75f69e5vlzs "Acces stock E"         : SmartLock stock
--     - bf971f85d8394f8222otkj "Acces escalier E"      : SmartLock escalier

-- 1. Extension du schema tuya_devices
alter table tuya_devices
  add column if not exists is_pointage boolean not null default false,
  add column if not exists online boolean,
  add column if not exists notes text,
  add column if not exists product_name text,
  add column if not exists category text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists tuya_devices_pointage_idx on tuya_devices(is_pointage) where is_pointage;

-- Drop NOT NULL sur site_id : les devices non-pointage et "C et F" futurs n ont pas de site assigne.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'tuya_devices' and column_name = 'site_id' and is_nullable = 'NO'
  ) then
    alter table tuya_devices alter column site_id drop not null;
  end if;
end $$;

-- 2. Insert/Upsert des 9 devices avec mapping CaftanRH

-- Pointage A : site A + fallback B/D (anciennement "Acces E" cote Tuya, renomme par Karim)
insert into tuya_devices (tuya_device_id, tuya_device_name, category, is_active, is_pointage, site_id, fallback_for_site_ids, notes)
select
  'bfffc2848a716cdeeeglax',
  'Pointage A',
  'mk',
  true,
  true,
  (select id from sites where code = 'A' limit 1),
  array(select id from sites where code in ('B', 'D')),
  'Sert Sites A + B + D (fallback proximite). Anciennement nomme "Acces E" cote Tuya, renomme "Pointage A" dans Smart Life par Karim. Si l identification est fausse, corriger via /admin/tuya/devices.'
on conflict (tuya_device_id) do update set
  tuya_device_name = excluded.tuya_device_name,
  category = excluded.category,
  is_active = true,
  is_pointage = true,
  site_id = excluded.site_id,
  fallback_for_site_ids = excluded.fallback_for_site_ids,
  notes = excluded.notes,
  updated_at = now();

-- Pointage E : site E
insert into tuya_devices (tuya_device_id, tuya_device_name, category, is_active, is_pointage, site_id, notes)
select
  'bfd90b87c696ead286zzxm',
  'Pointage E',
  'mk',
  true,
  true,
  (select id from sites where code = 'E' limit 1),
  'Site E uniquement (118 chaussee de Gand).'
on conflict (tuya_device_id) do update set
  tuya_device_name = excluded.tuya_device_name,
  category = excluded.category,
  is_active = true,
  is_pointage = true,
  site_id = excluded.site_id,
  notes = excluded.notes,
  updated_at = now();

-- Pointage C et F : Anvers, deploiement futur (site_id null)
insert into tuya_devices (tuya_device_id, tuya_device_name, category, is_active, is_pointage, site_id, notes)
values (
  'bf668eaa15b73d5f56nisa',
  'Pointage C et F',
  'mk',
  true,
  true,
  null,
  'Sites C et F (Anvers) - deploiement futur. Terminal physique actif, mapping site sera fait lors de la reactivation des sites Anvers.'
)
on conflict (tuya_device_id) do update set
  tuya_device_name = excluded.tuya_device_name,
  category = excluded.category,
  is_active = true,
  is_pointage = true,
  notes = excluded.notes,
  updated_at = now();

-- Pointage ElectroZeyn : autre business, hors-scope CaftanRH
insert into tuya_devices (tuya_device_id, tuya_device_name, category, is_active, is_pointage, notes)
values (
  'bf82afe3706630c4ff2mtp',
  'Pointage ElectroZeyn',
  'mk',
  false,
  false,
  'Hors-scope CaftanRH (autre business). Garde en base par tracabilite mais desactive.'
)
on conflict (tuya_device_id) do update set
  tuya_device_name = excluded.tuya_device_name,
  category = excluded.category,
  is_active = false,
  is_pointage = false,
  notes = excluded.notes,
  updated_at = now();

-- Acces Platinum : controle d acces depot, hors-scope pointage
insert into tuya_devices (tuya_device_id, tuya_device_name, category, is_active, is_pointage, notes)
values (
  'bf3984c8a5ba98b929cpgs',
  'Acces Platinum',
  'mk',
  true,
  false,
  'Controle d acces depot Platinum - HORS-SCOPE pointage CaftanRH (rien a voir avec le pointage des employes). Garde en base, dossier non-pointage.'
)
on conflict (tuya_device_id) do update set
  tuya_device_name = excluded.tuya_device_name,
  category = excluded.category,
  is_active = true,
  is_pointage = false,
  notes = excluded.notes,
  updated_at = now();

-- 4 SmartLocks (ms) : hors-scope pointage
insert into tuya_devices (tuya_device_id, tuya_device_name, category, is_active, is_pointage, notes) values
  ('60422568bcff4d095350',   'Acces Bureau A',            'ms', true, false, 'SmartLock - bureau Site A. Dossier non-pointage.'),
  ('bf7a05702d14cf4b6aulkq', 'Platinum Depot Porte verte', 'ms', true, false, 'SmartLock - depot Platinum porte verte. Dossier non-pointage.'),
  ('bfd6a211e7b75f69e5vlzs', 'Acces stock E',             'ms', true, false, 'SmartLock - stock Site E. Dossier non-pointage.'),
  ('bf971f85d8394f8222otkj', 'Acces escalier E',          'ms', true, false, 'SmartLock - escalier Site E. Dossier non-pointage.')
on conflict (tuya_device_id) do update set
  tuya_device_name = excluded.tuya_device_name,
  category = excluded.category,
  is_active = excluded.is_active,
  is_pointage = excluded.is_pointage,
  notes = excluded.notes,
  updated_at = now();
