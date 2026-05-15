-- Karim 15/05/2026 : rôles fonctionnels Manager et Responsable de Magasin.
-- Ces flags forcent le solver a :
--  1. Prioriser ces employes dans le pool de candidats OT
--  2. Appliquer un cap OT eleve : x2.0 pour manager, x2.5 pour
--     responsable de magasin (extreme besoin / "tout pouvoir")
--  3. Epuiser leur quota contractuel AVANT meme de regarder les autres

begin;

-- Relaxe la borne sup du multiplicateur (etait 1.0..2.0) pour permettre
-- le x2.5 du responsable de magasin.
alter table employees drop constraint if exists employees_ot_max_multiplier_check;
alter table employees add constraint employees_ot_max_multiplier_check
  check (ot_max_multiplier >= 1.0 and ot_max_multiplier <= 3.0);

alter table employees add column if not exists is_manager boolean not null default false;
alter table employees add column if not exists is_site_manager boolean not null default false;

-- Trigger : si is_site_manager passe a true, on releve ot_max_multiplier
-- a au moins 2.5 (cap extreme besoin). Idem manager -> 2.0.
create or replace function sync_ot_max_from_manager_flags()
returns trigger
language plpgsql
as $$
begin
  if new.is_site_manager = true and new.ot_max_multiplier < 2.5 then
    new.ot_max_multiplier := 2.5;
  elsif new.is_manager = true and not new.is_site_manager
        and new.ot_max_multiplier < 2.0 then
    new.ot_max_multiplier := 2.0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_ot_from_manager on employees;
create trigger trg_employees_ot_from_manager
  before insert or update of is_manager, is_site_manager on employees
  for each row execute function sync_ot_max_from_manager_flags();

-- Backfill : applique le trigger sur les rows existantes via no-op update.
update employees set is_manager = is_manager;

commit;
