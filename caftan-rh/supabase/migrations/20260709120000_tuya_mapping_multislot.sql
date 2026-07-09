-- Karim 2026-07-09 : MAPPING TUYA DURABLE / MULTI-SLOT.
--
-- Cause racine de la churn de re-mapping (prouvee sur donnees) :
--   * Le poll resout un badge par le SLOT NUMERIQUE local du terminal
--     (tuya_user_id). Ce numero n'est PAS stable : chaque re-enrolement
--     d'empreinte cree un nouveau slot (ex reel : 1 employe a 5 slots).
--   * L'ancienne contrainte UNIQUE (tuya_device_id, employee_id, direction)
--     forcait 1 seul slot par (employe, direction) : re-mapper un slot drifte
--     ECRASAIT l'ancien au lieu de l'AJOUTER, et bloquait le multi-slot.
--
-- FIX : un slot physique = une seule ligne de mapping (device, slot). On peut
-- desormais cumuler plusieurs slots actifs pour un meme employe. La lecture du
-- poll (resolution par device+tuya_user_id, iteration de tous les mappings)
-- supporte deja le multi-slot -> aucun changement de lecture.
--
-- Les lignes "alpha seul" (tuya_user_id NULL) restent autorisees en doublon
-- car UNIQUE traite les NULL comme distincts (NULLS DISTINCT, defaut PG).
-- Idempotente (drop IF EXISTS + add garde par pg_constraint).

begin;

-- 1) Retire la contrainte qui forcait 1 slot par (employe, direction).
alter table tuya_user_mapping
  drop constraint if exists tuya_user_mapping_unique_emp_dev_dir;

-- 2) Ajoute la contrainte "un slot appartient a un seul mapping".
--    (Contrainte NON partielle -> utilisable comme arbitre ON CONFLICT par
--     PostgREST pour les upserts onConflict "tuya_device_id,tuya_user_id".)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tuya_user_mapping'::regclass
      and conname = 'tuya_user_mapping_unique_device_slot'
  ) then
    alter table tuya_user_mapping
      add constraint tuya_user_mapping_unique_device_slot
      unique (tuya_device_id, tuya_user_id);
  end if;
end $$;

commit;
