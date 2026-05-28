-- Karim 2026-05-21 : un employe peut etre site_manager pour CERTAINS sites
-- seulement. La colonne employees.is_site_manager (globale) reste, mais on
-- ajoute une notion PAR SITE via site_assignments. En cas d absence du
-- responsable, son substitute_employee_id devient le responsable de fait.

alter table site_assignments
  add column if not exists is_site_manager boolean not null default false,
  add column if not exists substitute_employee_id uuid null
    references employees(id) on delete set null;

-- Backfill : si l employe est is_site_manager au niveau global ET est_primary
-- pour ce site, on coche aussi le flag par site. Permet la migration douce
-- des donnees existantes sans re-saisir.
update site_assignments sa
   set is_site_manager = true
  from employees e
 where e.id = sa.employee_id
   and e.is_site_manager = true
   and sa.is_primary = true
   and sa.is_site_manager = false
   and (sa.end_date is null or sa.end_date >= current_date);

comment on column site_assignments.is_site_manager is
  'Karim 2026-05-21 : responsable de CE site precisement. Pris en compte par le solver pour forcer la saturation du quota et la priorisation max.';

comment on column site_assignments.substitute_employee_id is
  'Karim 2026-05-21 : employe (du meme site) qui devient responsable temporairement en cas d absence totale du responsable principal.';
