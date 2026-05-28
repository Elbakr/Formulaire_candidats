-- Karim 2026-05-21 : 2 champs ergonomie travail.
alter table employees
  add column if not exists is_resistant boolean not null default false,
  add column if not exists derogation_max_consec_days smallint not null default 5;

comment on column employees.is_resistant is
  'Karim 2026-05-21 : si true, lever le cap 9h30/jour du solver.';
comment on column employees.derogation_max_consec_days is
  'Karim 2026-05-21 : nb max jours consec travailles. Default 5. Mgr/site_mgr non soumis.';
