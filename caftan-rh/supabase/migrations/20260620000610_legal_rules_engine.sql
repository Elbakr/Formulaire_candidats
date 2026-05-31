-- Karim 2026-05-30 : moteur regles legales desactivables (voir migration sister dans repo root)
create table if not exists public.legal_rules (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  category text default 'general',
  severity text default 'warn',
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

insert into public.legal_rules (slug, name, description, category, severity, parameters, legal_ref) values
  ('weekly_hours_full_38', 'Temps plein = 38h', 'Force weekly_hours a 38', 'duree_travail', 'auto_fix', '{"hours": 38}', 'CP 201'),
  ('weekly_hours_partial_13_30', 'Temps partiel 13-30h', 'Clamp [13, 30]', 'duree_travail', 'auto_fix', '{"min": 13, "max": 30}', 'CP 201'),
  ('student_hours_clamp', 'Etudiant 1-38h/sem', 'Clamp [1, 38]', 'duree_travail', 'auto_fix', '{"min": 1, "max": 38}', 'Loi etudiant'),
  ('no_cdi_policy', 'Politique no-CDI', 'CDI auto-converti en CDD', 'type_contrat', 'auto_fix', '{}', 'Politique Karim'),
  ('cdd_max_3_years', 'CDD <= 3 ans', 'WARN si CDD > 3 ans', 'type_contrat', 'warn', '{"max_days": 1095}', 'Art. 9 Loi 1978'),
  ('iban_be_checksum', 'IBAN BE valide MOD 97', 'Valide IBAN belge', 'paiement', 'block', '{}', 'IBAN ISO 13616'),
  ('student_annual_600h', 'Etudiant max 600h/an', 'WARN > 600h annee calendaire', 'duree_travail', 'warn', '{"max_hours": 600}', 'ONSS etudiant'),
  ('salary_min_cp201', 'Salaire min CP 201', 'WARN si < bareme CP 201', 'paye', 'warn', '{}', 'Bareme CP 201'),
  ('start_date_not_past', 'Date debut >= aujourd hui', 'WARN si retroactif', 'embauche', 'warn', '{}', 'Bonne pratique'),
  ('nrn_matches_dob', 'NRN matche date naissance', 'WARN si 6 premiers chiffres != YYMMDD birth_date', 'identite', 'warn', '{}', 'Registre National belge')
on conflict (slug) do nothing;

create or replace function public.is_rule_enabled(p_slug text) returns boolean as $$
  select coalesce((select enabled from public.legal_rules where slug = p_slug), true);
$$ language sql stable;

create or replace function public.touch_legal_rules() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_touch_legal_rules on public.legal_rules;
create trigger trg_touch_legal_rules before update on public.legal_rules
  for each row execute function public.touch_legal_rules();

create or replace function public.normalize_employee_legal() returns trigger as $$
declare
  is_student boolean;
  wt_full boolean;
  wt_partial boolean;
begin
  if new.contract_type = 'CDI' and public.is_rule_enabled('no_cdi_policy') then
    raise warning 'CDI converti en CDD (rule no_cdi_policy)';
    new.contract_type := 'CDD';
  end if;
  is_student := new.contract_type in ('Étudiant', 'Etudiant');
  if not is_student and new.work_time_kind is null and new.weekly_hours is not null then
    if new.weekly_hours >= 30 then new.work_time_kind := 'full';
    else new.work_time_kind := 'partial'; end if;
  end if;
  wt_full := new.work_time_kind = 'full';
  wt_partial := new.work_time_kind = 'partial';
  if wt_full and not is_student and public.is_rule_enabled('weekly_hours_full_38') then new.weekly_hours := 38; end if;
  if wt_partial and not is_student and public.is_rule_enabled('weekly_hours_partial_13_30') then
    if new.weekly_hours is null or new.weekly_hours < 13 then new.weekly_hours := 13;
    elsif new.weekly_hours > 30 then new.weekly_hours := 30; end if;
  end if;
  if is_student and new.weekly_hours is not null and public.is_rule_enabled('student_hours_clamp') then
    if new.weekly_hours < 1 then new.weekly_hours := 1; end if;
    if new.weekly_hours > 38 then new.weekly_hours := 38; end if;
  end if;
  if new.contract_type = 'CDD' and new.start_date is not null and new.end_date is not null
     and public.is_rule_enabled('cdd_max_3_years') then
    if new.end_date - new.start_date > 1095 then
      raise warning 'CDD > 3 ans (% jours)', new.end_date - new.start_date;
    end if;
  end if;
  if new.start_date is not null and new.start_date < current_date and public.is_rule_enabled('start_date_not_past') then
    raise warning 'start_date % retroactive', new.start_date;
  end if;
  if new.nrn is not null and new.birth_date is not null and public.is_rule_enabled('nrn_matches_dob') then
    declare
      norm text := replace(replace(new.nrn, '.', ''), '-', '');
      yy text := substring(norm from 1 for 2);
      mm text := substring(norm from 3 for 2);
      dd text := substring(norm from 5 for 2);
      eyy text := substring(to_char(new.birth_date, 'YYYY') from 3 for 2);
      emm text := to_char(new.birth_date, 'MM');
      edd text := to_char(new.birth_date, 'DD');
    begin
      if yy != eyy or mm != emm or dd != edd then
        raise warning 'NRN % mismatch birth_date % (attendu %%%)', new.nrn, new.birth_date, eyy, emm, edd;
      end if;
    end;
  end if;
  return new;
end;
$$ language plpgsql;
