-- Disponibilités et contraintes par employé pour la génération automatique

alter table employees
  add column if not exists fixed_off_days integer[] default array[]::integer[],
  add column if not exists preferred_site_ids uuid[] default array[]::uuid[],
  add column if not exists unavailable_site_ids uuid[] default array[]::uuid[],
  add column if not exists default_start_time time default '10:00',
  add column if not exists default_pause_minutes integer default 30,
  add column if not exists default_shift_hours numeric(3,1) default 8.0,
  add column if not exists wd_mode text default 'auto',
  add column if not exists week_cycle integer default 1,
  add column if not exists week_phase integer default 0,
  add column if not exists planning_notes text;

-- Indexes utiles pour l'algo
create index if not exists idx_employees_active_status on employees(status) where status = 'active';
