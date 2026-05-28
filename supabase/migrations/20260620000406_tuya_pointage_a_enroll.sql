-- Karim 2026-05-24 : enrolement automatique des 14 empreintes de Pointage A
-- par DEDUCTION LOGIQUE sur les noms Tuya vs employees CaftanRH.
--
-- Mapping decide :
--   4hnqyu "Omaima"   -> Omaima Ouahi (1 seule Omaima en BD)
--   4rh3ki "Saliima"  -> Salima Alaoui (1 seule Salima en BD)
--   4rh542 "Chaymae"  -> NEW: Chaymae Site A
--   4rmzdi "Lina"     -> El Bertitan Lina (1 seule Lina en BD, 2e empreinte)
--   4rmzga "Ilham"    -> Ilham Serghini
--   4rnsji "Ibtissam" -> Ibtissem Benoukhita
--   4rpii2 "Hafsa"    -> Hafsa Imachaal
--   4rptm2 "Assya"    -> NEW: Assya Site A
--   4tcpwm "Selma"    -> Selma Maissa (1 seule Selma en BD)
--   4thiqu "hajar"    -> NEW: Hajar Site A
--   4tjrau "aya"      -> NEW: Aya Site A
--   4vfdmy "lina 2"   -> El Bertitan Lina (1ere empreinte)
--   4xydby "sanae IL" -> Sanae Asaidi (1 seule Sanae en BD)
--   4zeydy "doha"     -> Rekimi Doha (1 seule Doha en BD)
--
-- Le slot local (tuya_user_id numerique) est inconnu pour l instant. Sera
-- identifie au prochain pointage de chaque employee via /admin/tuya/logs.
-- L UI proposera le bon employe (via tuya_user_id_alpha) en suggestion.

-- 1. Ajoute colonne tuya_user_id_alpha pour stocker le user_id alphanumerique
alter table tuya_user_mapping
  add column if not exists tuya_user_id_alpha text;

-- 2. Permet tuya_user_id NULL temporairement (le temps que le slot soit identifie)
alter table tuya_user_mapping alter column tuya_user_id drop not null;

-- 3. Drop l ancienne unique constraint (tuya_user_id, direction) qui empeche
--    plusieurs lignes avec tuya_user_id=null pour la meme direction
alter table tuya_user_mapping
  drop constraint if exists tuya_user_mapping_tuya_user_id_direction_key;

-- 4. Cree explicitement la nouvelle contrainte unique sur (device, employee, direction).
--    On utilise DROP IF EXISTS + ADD pour garantir qu elle existe avant l INSERT
--    qui en a besoin pour l ON CONFLICT.
alter table tuya_user_mapping
  drop constraint if exists tuya_user_mapping_unique_emp_dev_dir;
alter table tuya_user_mapping
  add constraint tuya_user_mapping_unique_emp_dev_dir
  unique (tuya_device_id, employee_id, direction);

-- 5. Cree les 4 employees manquantes (Site A) avec email placeholder.
--    Pas de unique constraint sur employees.email, donc on filtre par NOT EXISTS.
insert into employees (email, full_name, job_title, contract_type, weekly_hours, start_date, status)
select v.email, v.full_name, v.job_title, v.contract_type, v.weekly_hours, current_date, 'active'::employee_status
from (values
  ('tuya-aya@local.caftanrh', 'Aya', 'À définir', 'CDI', 38),
  ('tuya-hajar@local.caftanrh', 'Hajar', 'À définir', 'CDI', 38),
  ('tuya-assya@local.caftanrh', 'Assya', 'À définir', 'CDI', 38),
  ('tuya-chaymae@local.caftanrh', 'Chaymae', 'À définir', 'CDI', 38)
) as v(email, full_name, job_title, contract_type, weekly_hours)
where not exists (
  select 1 from employees e where e.email = v.email
);

-- 6. Site_assignments Site A pour les 4 nouvelles (skip si deja un assignment).
insert into site_assignments (employee_id, site_id, start_date, is_primary)
select e.id, (select id from sites where code = 'A' limit 1), current_date, true
from employees e
where e.email in (
  'tuya-aya@local.caftanrh',
  'tuya-hajar@local.caftanrh',
  'tuya-assya@local.caftanrh',
  'tuya-chaymae@local.caftanrh'
)
  and not exists (
    select 1 from site_assignments sa
    where sa.employee_id = e.id
      and sa.site_id = (select id from sites where code = 'A' limit 1)
  );

-- 7. Les 14 mappings name-based (tuya_user_id_alpha, tuya_user_id=null pour l instant)
--    On insere un mapping direction='in' par defaut. L alternance auto IN/OUT
--    du poll s en chargera quand les events arriveront.
-- NOTE : El Bertitan Lina a 2 empreintes enrolees (4rmzdi "Lina" et 4vfdmy
-- "lina 2"). Pour pouvoir creer 2 rows de mapping pour la meme employee
-- (sans casser le unique (device, employee, direction)), on assigne 'in'
-- au premier et 'out' au deuxieme. Comme le poll utilise l alternance
-- chronologique (pas direction), ca n a aucun impact fonctionnel.
insert into tuya_user_mapping (
  tuya_device_id, tuya_user_id, tuya_user_id_alpha, employee_id, direction, tuya_name, is_active
)
select 'bfb90ad2054971aefatjkh', null, m.alpha, e.id, m.dir, m.tuya_name, true
from (values
  ('4hnqyu', 'Omaima', 'Omaima Ouahi', 'in'),
  ('4rh3ki', 'Saliima', 'Salima Alaoui', 'in'),
  ('4rh542', 'Chaymae', 'Chaymae', 'in'),
  ('4rmzdi', 'Lina', 'El Bertitan Lina', 'in'),
  ('4rmzga', 'Ilham', 'Ilham Serghini', 'in'),
  ('4rnsji', 'Ibtissam', 'Ibtissem Benoukhita', 'in'),
  ('4rpii2', 'Hafsa', 'Hafsa Imachaal', 'in'),
  ('4rptm2', 'Assya', 'Assya', 'in'),
  ('4tcpwm', 'Selma', 'Selma Maïssa', 'in'),
  ('4thiqu', 'hajar', 'Hajar', 'in'),
  ('4tjrau', 'aya', 'Aya', 'in'),
  ('4vfdmy', 'lina 2', 'El Bertitan Lina', 'out'),
  ('4xydby', 'sanae IL', 'Sanae Asaidi', 'in'),
  ('4zeydy', 'doha', 'Rekimi Doha', 'in')
) as m(alpha, tuya_name, emp_full_name, dir)
join employees e on e.full_name = m.emp_full_name and e.status = 'active'
on conflict (tuya_device_id, employee_id, direction) do update set
  tuya_user_id_alpha = excluded.tuya_user_id_alpha,
  tuya_name = excluded.tuya_name,
  is_active = true;
