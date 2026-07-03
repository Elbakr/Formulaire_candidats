-- Karim 2026-07-03 (audit senior) : le trigger normalize_employee_legal
-- corrompait la durée contractuelle (base paie/Dimona) :
--   1. seuil temps plein à 30h au lieu de 38h -> un 30-37h était marqué 'full' ;
--   2. écrivait 'partial' alors que la contrainte CHECK exige 'part' (violation) ;
--   3. forçait weekly_hours := 38 -> écrasait une valeur RH explicite (35h -> 38h) ;
--   4. clampait un temps partiel à 30h max (bug de l'ancien seuil) -> 35h -> 30h.
-- Correctif : seuil 38h, valeur 'part' (conforme au CHECK), auto-fix UNIQUEMENT
-- quand la valeur est absente (ne JAMAIS écraser une saisie RH explicite),
-- plancher légal partiel 13h conservé, plus de clamp haut.

create or replace function public.normalize_employee_legal()
 returns trigger
 language plpgsql
as $function$
declare
  is_student boolean;
  wt_full boolean;
  wt_partial boolean;
begin
  -- Anti-CDI (rule = no_cdi_policy)
  if new.contract_type = 'CDI' and public.is_rule_enabled('no_cdi_policy') then
    raise warning 'Contract type CDI converti en CDD (rule no_cdi_policy)';
    new.contract_type := 'CDD';
  end if;

  is_student := new.contract_type in ('Étudiant', 'Etudiant');

  -- Auto-derive work_time_kind si NULL : seuil 38h, valeurs 'full'/'part' (CHECK).
  if not is_student and new.work_time_kind is null and new.weekly_hours is not null then
    if new.weekly_hours >= 38 then new.work_time_kind := 'full';
    else new.work_time_kind := 'part'; end if;
  end if;

  wt_full := new.work_time_kind = 'full';
  wt_partial := new.work_time_kind = 'part';

  -- Temps plein = 38h (rule = weekly_hours_full_38) : on ne REMPLIT que si absent,
  -- on n'écrase JAMAIS une valeur explicite saisie par la RH.
  if wt_full and not is_student and public.is_rule_enabled('weekly_hours_full_38') then
    if new.weekly_hours is null then new.weekly_hours := 38; end if;
  end if;

  -- Temps partiel : plancher légal 13h (rule = weekly_hours_partial_13_30).
  -- Plus de clamp haut : un partiel légitime peut aller jusqu'à <38h.
  if wt_partial and not is_student and public.is_rule_enabled('weekly_hours_partial_13_30') then
    if new.weekly_hours is null or new.weekly_hours < 13 then new.weekly_hours := 13; end if;
  end if;

  -- Etudiant 1-38h (rule = student_hours_clamp)
  if is_student and new.weekly_hours is not null and public.is_rule_enabled('student_hours_clamp') then
    if new.weekly_hours < 1 then new.weekly_hours := 1; end if;
    if new.weekly_hours > 38 then new.weekly_hours := 38; end if;
  end if;

  -- CDD <= 3 ans (rule = cdd_max_3_years)
  if new.contract_type = 'CDD' and new.start_date is not null and new.end_date is not null
     and public.is_rule_enabled('cdd_max_3_years') then
    if new.end_date - new.start_date > 1095 then
      raise warning 'CDD > 3 ans (% jours) - risque requalification CDI', new.end_date - new.start_date;
    end if;
  end if;

  -- start_date pas dans le passe (rule = start_date_not_past)
  if new.start_date is not null and new.start_date < current_date
     and public.is_rule_enabled('start_date_not_past') then
    raise warning 'start_date % est dans le passe', new.start_date;
  end if;

  -- NRN matche birth_date (rule = nrn_matches_dob)
  if new.nrn is not null and new.birth_date is not null
     and public.is_rule_enabled('nrn_matches_dob') then
    declare
      yy text := substring(replace(replace(new.nrn, '.', ''), '-', '') from 1 for 2);
      mm text := substring(replace(replace(new.nrn, '.', ''), '-', '') from 3 for 2);
      dd text := substring(replace(replace(new.nrn, '.', ''), '-', '') from 5 for 2);
      expected_yy text := substring(to_char(new.birth_date, 'YYYY') from 3 for 2);
      expected_mm text := to_char(new.birth_date, 'MM');
      expected_dd text := to_char(new.birth_date, 'DD');
    begin
      if yy != expected_yy or mm != expected_mm or dd != expected_dd then
        raise warning 'NRN % ne match pas birth_date % (attendu YYMMDD=%/%/%)', new.nrn, new.birth_date, expected_yy, expected_mm, expected_dd;
      end if;
    end;
  end if;

  return new;
end;
$function$;
