-- Karim 2026-05-30 : couche legale belge anti-erreur sur fiche employee.

create or replace function public.normalize_employee_legal() returns trigger as $$
declare
  is_student boolean;
  wt_full boolean;
  wt_partial boolean;
begin
  if new.contract_type = 'CDI' then
    raise warning 'Contract type CDI converti en CDD (politique CaftanRH)';
    new.contract_type := 'CDD';
  end if;
  is_student := new.contract_type in ('Étudiant', 'Etudiant');
  if not is_student and new.work_time_kind is null and new.weekly_hours is not null then
    if new.weekly_hours >= 30 then new.work_time_kind := 'full';
    else new.work_time_kind := 'partial'; end if;
  end if;
  wt_full := new.work_time_kind = 'full';
  wt_partial := new.work_time_kind = 'partial';
  if wt_full and not is_student then new.weekly_hours := 38; end if;
  if wt_partial and not is_student then
    if new.weekly_hours is null or new.weekly_hours < 13 then new.weekly_hours := 13;
    elsif new.weekly_hours > 30 then new.weekly_hours := 30; end if;
  end if;
  if is_student and new.weekly_hours is not null then
    if new.weekly_hours < 1 then new.weekly_hours := 1; end if;
    if new.weekly_hours > 38 then new.weekly_hours := 38; end if;
  end if;
  if new.contract_type = 'CDD' and new.start_date is not null and new.end_date is not null then
    if new.end_date - new.start_date > 1095 then
      raise warning 'CDD > 3 ans (% jours) - risque requalification CDI', new.end_date - new.start_date;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_normalize_employee_legal on public.employees;
create trigger trg_normalize_employee_legal
  before insert or update of weekly_hours, contract_type, work_time_kind, start_date, end_date
  on public.employees
  for each row execute function public.normalize_employee_legal();

create or replace function public.normalize_employee_contract_legal() returns trigger as $$
begin
  if new.contract_kind = 'CDI' then
    raise warning 'Contract kind CDI converti en CDD';
    new.contract_kind := 'CDD';
  end if;
  if new.weekly_hours is not null and new.weekly_hours > 38 then new.weekly_hours := 38; end if;
  if new.weekly_hours is not null and new.weekly_hours < 1 then new.weekly_hours := 1; end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_normalize_employee_contract_legal on public.employee_contracts;
create trigger trg_normalize_employee_contract_legal
  before insert or update of weekly_hours, contract_kind
  on public.employee_contracts
  for each row execute function public.normalize_employee_contract_legal();
