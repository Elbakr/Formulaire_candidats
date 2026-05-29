-- Champs additionnels sur employees pour génération auto fiche secrétariat
-- social + contrat (lieu/date naissance, lieu signature, transport, temps de travail).

alter table public.employees
  add column if not exists birth_date date,
  add column if not exists birth_place text,
  add column if not exists signature_place text check (signature_place in ('Bruxelles','Anvers')),
  add column if not exists transport_frequency text check (transport_frequency in ('mensuel','annuel')),
  add column if not exists work_time_kind text check (work_time_kind in ('full','part'));
