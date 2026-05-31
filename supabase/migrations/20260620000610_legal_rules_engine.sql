-- Karim 2026-05-30 : moteur de regles legales desactivables.
-- Chaque regle metier (limites 38h, no-CDI, CDD <= 3 ans, NISS-DOB, ...) a
-- une ligne ici avec enabled true/false. Les triggers/UI consultent
-- is_rule_enabled(slug) avant d appliquer la regle.
-- Permet a Karim de desactiver une regle ponctuellement (ex: contrat
-- exceptionnel hors normes) sans toucher au code.

create table if not exists public.legal_rules (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  category text default 'general',
  severity text default 'warn',         -- 'warn' | 'block' | 'auto_fix'
  enabled boolean not null default true,
  parameters jsonb default '{}'::jsonb,
  legal_ref text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.legal_rules enable row level security;
drop policy if exists "legal_rules_read" on public.legal_rules;
create policy "legal_rules_read" on public.legal_rules for select to authenticated using (true);
drop policy if exists "legal_rules_admin_write" on public.legal_rules;
create policy "legal_rules_admin_write" on public.legal_rules for all
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Seed des regles actuellement implementees + futures
insert into public.legal_rules (slug, name, description, category, severity, parameters, legal_ref) values
  ('weekly_hours_full_38', 'Temps plein = 38h', 'Force weekly_hours a 38 pour work_time_kind=full (CDD/CDI non etudiant)', 'duree_travail', 'auto_fix', '{"hours": 38}', 'CP 201'),
  ('weekly_hours_partial_13_30', 'Temps partiel 13-30h', 'Clamp weekly_hours dans [13, 30] pour work_time_kind=partial (CDD/CDI non etudiant)', 'duree_travail', 'auto_fix', '{"min": 13, "max": 30}', 'CP 201 + Loi 3 juillet 1978'),
  ('student_hours_clamp', 'Etudiant 1-38h/sem', 'Clamp weekly_hours dans [1, 38] pour Etudiant', 'duree_travail', 'auto_fix', '{"min": 1, "max": 38}', 'Loi etudiant'),
  ('no_cdi_policy', 'Politique no-CDI', 'Convertit automatiquement CDI en CDD', 'type_contrat', 'auto_fix', '{}', 'Politique Karim'),
  ('cdd_max_3_years', 'CDD <= 3 ans', 'WARN si CDD > 3 ans (risque requalification CDI implicite)', 'type_contrat', 'warn', '{"max_days": 1095}', 'Art. 9 Loi 1978'),
  ('iban_be_checksum', 'IBAN BE valide (MOD 97)', 'Valide format + checksum IBAN belge', 'paiement', 'block', '{}', 'IBAN ISO 13616'),
  ('student_annual_600h', 'Etudiant max 600h/an', 'WARN si total heures planifiees > 600h annee calendaire (perte taux ONSS reduit)', 'duree_travail', 'warn', '{"max_hours": 600}', 'ONSS etudiant'),
  ('salary_min_cp201', 'Salaire min CP 201', 'WARN si hourly_rate < bareme CP 201 selon age/anciennete', 'paye', 'warn', '{}', 'Bareme CP 201'),
  ('start_date_not_past', 'Date debut >= aujourd hui', 'WARN si start_date < today (anti contrat retroactif)', 'embauche', 'warn', '{}', 'Bonne pratique'),
  ('nrn_matches_dob', 'NRN = date naissance inversee', 'Verifie que les 6 premiers chiffres NRN matchent YYMMDD de birth_date (peut etre override)', 'identite', 'warn', '{}', 'Reg. National belge')
on conflict (slug) do nothing;

-- Helper : enabled ?
create or replace function public.is_rule_enabled(p_slug text) returns boolean as $$
  select coalesce((select enabled from public.legal_rules where slug = p_slug), true);
$$ language sql stable;

-- Trigger updated_at
create or replace function public.touch_legal_rules() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_touch_legal_rules on public.legal_rules;
create trigger trg_touch_legal_rules before update on public.legal_rules
  for each row execute function public.touch_legal_rules();

-- Modifie normalize_employee_legal pour consulter is_rule_enabled
create or replace function public.normalize_employee_legal() returns trigger as $$
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

  -- Auto-derive work_time_kind si NULL
  if not is_student and new.work_time_kind is null and new.weekly_hours is not null then
    if new.weekly_hours >= 30 then new.work_time_kind := 'full';
    else new.work_time_kind := 'partial'; end if;
  end if;

  wt_full := new.work_time_kind = 'full';
  wt_partial := new.work_time_kind = 'partial';

  -- Temps plein = 38h (rule = weekly_hours_full_38)
  if wt_full and not is_student and public.is_rule_enabled('weekly_hours_full_38') then
    new.weekly_hours := 38;
  end if;

  -- Temps partiel 13-30h (rule = weekly_hours_partial_13_30)
  if wt_partial and not is_student and public.is_rule_enabled('weekly_hours_partial_13_30') then
    if new.weekly_hours is null or new.weekly_hours < 13 then new.weekly_hours := 13;
    elsif new.weekly_hours > 30 then new.weekly_hours := 30; end if;
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
$$ language plpgsql;
