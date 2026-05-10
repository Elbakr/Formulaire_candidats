-- Module 5 — Performance & Cycle de vie
-- Notes hebdomadaires manager + Recommandations CDD J-30 + Pondération KPI.
-- Idempotente.

-- ============================================================================
-- 1. Notes hebdomadaires manager (différentes des evaluations 7 axes)
-- ============================================================================

create table if not exists weekly_employee_ratings (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  rater_profile_id uuid references profiles(id) on delete set null,
  week_monday date not null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, week_monday)
);

create index if not exists idx_wer_emp_week on weekly_employee_ratings (employee_id, week_monday desc);
create index if not exists idx_wer_week on weekly_employee_ratings (week_monday desc);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_wer_updated_at') then
    create trigger trg_wer_updated_at before update on weekly_employee_ratings
    for each row execute function set_updated_at();
  end if;
end $$;

alter table weekly_employee_ratings enable row level security;

drop policy if exists wer_self_read       on weekly_employee_ratings;
drop policy if exists wer_manager_write   on weekly_employee_ratings;
drop policy if exists wer_manager_update  on weekly_employee_ratings;
drop policy if exists wer_manager_delete  on weekly_employee_ratings;
drop policy if exists wer_admin_all       on weekly_employee_ratings;

-- L'employé concerné peut lire ses propres notes (mais l'UI masquera les commentaires).
-- Manager / RH / admin peuvent lire toutes les notes.
create policy wer_self_read on weekly_employee_ratings for select using (
  exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
  or is_manager()
);

create policy wer_manager_write on weekly_employee_ratings for insert with check (is_manager());
create policy wer_manager_update on weekly_employee_ratings for update using (is_manager()) with check (is_manager());
create policy wer_manager_delete on weekly_employee_ratings for delete using (is_manager());
create policy wer_admin_all on weekly_employee_ratings for all using (is_rh()) with check (is_rh());

-- ============================================================================
-- 2. Recommandations CDD J-30
-- ============================================================================

create table if not exists cdd_renewal_recommendations (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  contract_end_date date not null,
  prepared_at timestamptz not null default now(),
  recommendation text not null check (recommendation in ('renew', 'do_not_renew', 'discuss')),
  rationale text not null,
  global_score numeric(5,2),
  trends jsonb,
  site_load_forecast jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'discussing', 'rejected_by_admin', 'archived')),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  unique (employee_id, contract_end_date)
);

create index if not exists idx_cdd_status on cdd_renewal_recommendations (status, contract_end_date);
create index if not exists idx_cdd_employee on cdd_renewal_recommendations (employee_id);

alter table cdd_renewal_recommendations enable row level security;

drop policy if exists crr_admin_all      on cdd_renewal_recommendations;
drop policy if exists crr_manager_read   on cdd_renewal_recommendations;

create policy crr_admin_all      on cdd_renewal_recommendations for all using (is_rh()) with check (is_rh());
create policy crr_manager_read   on cdd_renewal_recommendations for select using (is_manager());

-- ============================================================================
-- 3. Pondération KPI (admin paramétrable)
-- ============================================================================

alter table org_settings
  add column if not exists kpi_weights jsonb default
    '{"ponctualite": 25, "fiabilite": 25, "heures_vs_prevu": 20, "absences": 15, "rating_hebdo": 15, "ventes": 0}'::jsonb;

-- Backfill : pour les org_settings existants (ligne id=1) qui n'auraient pas la colonne.
update org_settings
   set kpi_weights = '{"ponctualite": 25, "fiabilite": 25, "heures_vs_prevu": 20, "absences": 15, "rating_hebdo": 15, "ventes": 0}'::jsonb
 where id = 1 and kpi_weights is null;

-- ============================================================================
-- 4. Realtime
-- ============================================================================

do $$ begin
  begin alter publication supabase_realtime add table weekly_employee_ratings;       exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table cdd_renewal_recommendations;   exception when duplicate_object then null; end;
end $$;

-- ============================================================================
-- 5. Templates emails CDD (insert idempotent)
-- ============================================================================

insert into email_templates (slug, label, subject, body_html, category, is_active)
values
  ('cdd_renewal_propose',
   'CDD — Proposition de renouvellement',
   'Bonjour {{full_name}}, on souhaite continuer avec toi',
   '<p>Bonjour {{full_name}},</p><p>Suite à ton parcours chez Caftan Factory, on souhaite te proposer le renouvellement de ton contrat CDD qui se termine le <strong>{{contract_end_date}}</strong>.</p><p>{{rationale}}</p><p>On en discute la semaine prochaine pour caler les modalités. À très vite,<br>{{org_signature}}</p>',
   'cdd',
   true),
  ('cdd_renewal_discuss',
   'CDD — Invitation à discuter',
   'Bonjour {{full_name}}, parlons de la suite',
   '<p>Bonjour {{full_name}},</p><p>Ton CDD se termine le <strong>{{contract_end_date}}</strong>. Avant toute décision, on souhaite faire un point avec toi pour échanger sur ton expérience et la suite.</p><p>{{rationale}}</p><p>Ton manager te proposera un créneau dans les jours qui viennent.</p><p>{{org_signature}}</p>',
   'cdd',
   true),
  ('cdd_no_renewal',
   'CDD — Non-renouvellement',
   'Bonjour {{full_name}}, fin de ton contrat CDD',
   '<p>Bonjour {{full_name}},</p><p>Comme convenu, ton contrat CDD se termine le <strong>{{contract_end_date}}</strong> et ne sera pas reconduit.</p><p>{{rationale}}</p><p>Merci pour ta contribution. Ce courrier doit toujours être contresigné par un humain — il ne s''envoie jamais automatiquement.</p><p>{{org_signature}}</p>',
   'cdd',
   true)
on conflict (slug) do nothing;
