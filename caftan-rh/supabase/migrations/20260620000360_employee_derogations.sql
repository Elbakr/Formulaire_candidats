-- Karim 2026-05-21 : 2 champs ergonomie travail.
-- is_resistant         : peut faire des journees plus longues (>9h30) sans
--                        cap dur. Par defaut false : tout le monde est cape
--                        a 9h30/j sauf jours feries.
-- derogation_max_consec_days : nb max de jours travailles consecutifs avant
--                        repos obligatoire. Default 5 (sauf managers/responsables
--                        qui n y sont pas soumis). RH peut monter a 6 ou 7
--                        pour un employe qui le demande.

alter table employees
  add column if not exists is_resistant boolean not null default false,
  add column if not exists derogation_max_consec_days smallint not null default 5;

comment on column employees.is_resistant is
  'Karim 2026-05-21 : si true, lever le cap 9h30/jour du solver. Par defaut false (toutes les journees plafonnees a 9h30 sauf jours feries).';

comment on column employees.derogation_max_consec_days is
  'Karim 2026-05-21 : nombre max de jours travailles consecutifs (R1). Default 5 pour tous. RH peut monter a 6/7 pour un employe qui le souhaite. Les managers et responsables de site ne sont pas soumis a ce cap.';
