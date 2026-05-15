-- Karim 15/05/2026 : potentiometre par employe pour le coefficient OT max.
-- Remplace progressivement ot_eligible (boolean) par ot_max_multiplier
-- (numeric 1.0..2.0). ot_eligible reste pour la retrocompat (calcule a
-- partir de la valeur du multiplier > 1.0).
--
-- Exemple : Salima a max=1.25 -> peut faire jusqu a weekly_hours * 1.25.
-- Salmane a max=1.5 -> peut faire jusqu a weekly_hours * 1.5. Si un slot
-- est autorise a x1.5 et que Salima est candidate, le solver utilisera
-- min(1.5, 1.25) = 1.25 comme cap personnel.

begin;

alter table employees
  add column if not exists ot_max_multiplier numeric not null default 1.0
    check (ot_max_multiplier >= 1.0 and ot_max_multiplier <= 2.0);

-- Backfill : employes deja ot_eligible -> 1.5 par defaut (= comportement
-- historique). Les autres restent a 1.0 (= pas eligible).
update employees
  set ot_max_multiplier = 1.5
  where ot_eligible = true and ot_max_multiplier = 1.0;

-- Synchroniser ot_eligible aux changements futurs via trigger : si quelqu un
-- ecrit ot_max_multiplier > 1.0, ot_eligible passe a true ; sinon false.
-- Cela garantit que le code existant qui lit ot_eligible reste correct.
create or replace function sync_ot_eligible_from_multiplier()
returns trigger
language plpgsql
as $$
begin
  if new.ot_max_multiplier is null or new.ot_max_multiplier <= 1.0 then
    new.ot_eligible := false;
  else
    new.ot_eligible := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_ot_eligible_sync on employees;
create trigger trg_employees_ot_eligible_sync
  before insert or update of ot_max_multiplier on employees
  for each row execute function sync_ot_eligible_from_multiplier();

commit;
