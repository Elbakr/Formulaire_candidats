-- Karim 2026-05-30 : couche legale belge anti-erreur sur fiche employee.
--
-- Regles automatiquement appliquees via trigger BEFORE INSERT/UPDATE :
--
-- 1. weekly_hours :
--    - Temps plein (work_time_kind='full', CDD/CDI) -> force 38h (CP 201)
--    - Temps partiel (work_time_kind='partial', CDD/CDI) -> clamp [13, 30]
--      (min 1/3 d un temps plein = 13h pour CP 201, max 30 avant requalification)
--    - Etudiant -> clamp [1, 38] (regles specifiques 600h/an non strictement
--      enforce ici - vérification cumulée à faire séparément)
--
-- 2. Auto-derive work_time_kind si NULL :
--    - Si weekly_hours >= 30 -> 'full'
--    - Si weekly_hours < 30 -> 'partial'
--
-- 3. CDD : end_date - start_date <= 3 ans (loi belge max 3 ans, sinon CDI implicite)
--
-- 4. Anti-CDI : interdit contract_type='CDI' (politique Karim, jamais de CDI)
--    -> auto-converti en 'CDD' avec WARN

create or replace function public.normalize_employee_legal() returns trigger as $$
declare
  is_student boolean;
  wt_full boolean;
  wt_partial boolean;
begin
  -- Anti-CDI : convertit en CDD (memoire feedback Karim)
  if new.contract_type = 'CDI' then
    raise warning 'Contract type CDI converti en CDD (politique CaftanRH)';
    new.contract_type := 'CDD';
  end if;

  is_student := new.contract_type in ('Étudiant', 'Etudiant');

  -- Auto-derive work_time_kind si NULL (CDD seulement)
  if not is_student and new.work_time_kind is null and new.weekly_hours is not null then
    if new.weekly_hours >= 30 then
      new.work_time_kind := 'full';
    else
      new.work_time_kind := 'partial';
    end if;
  end if;

  wt_full := new.work_time_kind = 'full';
  wt_partial := new.work_time_kind = 'partial';

  -- Temps plein (non-etudiant) -> 38h
  if wt_full and not is_student then
    new.weekly_hours := 38;
  end if;

  -- Temps partiel (non-etudiant) -> clamp [13, 30]
  if wt_partial and not is_student then
    if new.weekly_hours is null or new.weekly_hours < 13 then
      new.weekly_hours := 13;
    elsif new.weekly_hours > 30 then
      new.weekly_hours := 30;
    end if;
  end if;

  -- Etudiant -> clamp [1, 38]
  if is_student and new.weekly_hours is not null then
    if new.weekly_hours < 1 then new.weekly_hours := 1; end if;
    if new.weekly_hours > 38 then new.weekly_hours := 38; end if;
  end if;

  -- CDD : end_date - start_date <= 3 ans (loi belge)
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

-- Application meme regle sur employee_contracts (table contrats archivés)
create or replace function public.normalize_employee_contract_legal() returns trigger as $$
begin
  if new.contract_kind = 'CDI' then
    raise warning 'Contract kind CDI converti en CDD';
    new.contract_kind := 'CDD';
  end if;
  if new.weekly_hours is not null and new.weekly_hours > 38 then
    new.weekly_hours := 38;
  end if;
  if new.weekly_hours is not null and new.weekly_hours < 1 then
    new.weekly_hours := 1;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_normalize_employee_contract_legal on public.employee_contracts;
create trigger trg_normalize_employee_contract_legal
  before insert or update of weekly_hours, contract_kind
  on public.employee_contracts
  for each row execute function public.normalize_employee_contract_legal();
