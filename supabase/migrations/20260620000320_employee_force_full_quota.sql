-- Karim 19/05 : force_full_quota - case a cocher fiche employe.
-- Si TRUE, le solveur DOIT placer toute la reserve d heures contractuelles
-- sans exception, quitte a ignorer fixed_off_days ou creer des mini-shifts.
-- Si FALSE (defaut), comportement habituel (peut laisser un reste non place).

alter table employees add column if not exists force_full_quota boolean not null default false;

comment on column employees.force_full_quota is
  'Karim 19/05 : si TRUE, generateEmployeeWeekPlanAction force la distribution complete du quota hebdo (ignore fixed_off_days, mini-shifts < 1h autorises, allonge shifts existants). FALSE par defaut.';
