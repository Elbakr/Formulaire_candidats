-- Onboarding checklist post-embauche
-- Templates + per-employee runs auto-créés à la création d'un employé

-- 1) Templates (modèles génériques)
create table onboarding_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  is_default boolean default false,
  created_at timestamptz not null default now()
);

create table onboarding_template_items (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references onboarding_templates(id) on delete cascade,
  position integer not null default 0,
  label text not null,
  description text,
  category text default 'admin', -- admin | tools | training | legal
  is_required boolean default true,
  responsible_role text default 'rh' -- rh | employee | manager
);
create index idx_onb_items_template on onboarding_template_items (template_id, position);

-- 2) Runs per employee + items concrets
create table onboarding_runs (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  template_id uuid references onboarding_templates(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (employee_id)
);

create table onboarding_run_items (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references onboarding_runs(id) on delete cascade,
  template_item_id uuid references onboarding_template_items(id) on delete set null,
  label text not null,
  description text,
  category text,
  is_required boolean default true,
  responsible_role text default 'rh',
  position integer default 0,
  done_at timestamptz,
  done_by uuid references profiles(id) on delete set null,
  notes text
);
create index idx_onb_run_items on onboarding_run_items (run_id, position);

-- 3) RLS
alter table onboarding_templates enable row level security;
alter table onboarding_template_items enable row level security;
alter table onboarding_runs enable row level security;
alter table onboarding_run_items enable row level security;

-- Templates: lecture par tout manager+, écriture par RH/admin
create policy onb_tpl_read on onboarding_templates for select using (is_manager());
create policy onb_tpl_rh_write on onboarding_templates for all using (is_rh()) with check (is_rh());

create policy onb_tpl_items_read on onboarding_template_items for select using (is_manager());
create policy onb_tpl_items_rh_write on onboarding_template_items for all using (is_rh()) with check (is_rh());

-- Runs: lecture manager + RH + employé concerné, update idem
create policy onb_runs_read on onboarding_runs for select
  using (
    is_manager()
    or exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid())
  );
create policy onb_runs_rh_write on onboarding_runs for all using (is_rh()) with check (is_rh());
create policy onb_runs_manager_update on onboarding_runs for update
  using (is_manager()) with check (is_manager());
create policy onb_runs_self_update on onboarding_runs for update
  using (exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid()))
  with check (exists (select 1 from employees e where e.id = employee_id and e.profile_id = auth.uid()));

-- Run items: lecture manager + RH + employé concerné
create policy onb_items_read on onboarding_run_items for select
  using (
    is_manager()
    or exists (
      select 1 from onboarding_runs r
      join employees e on e.id = r.employee_id
      where r.id = run_id and e.profile_id = auth.uid()
    )
  );

create policy onb_items_rh_write on onboarding_run_items for all using (is_rh()) with check (is_rh());

create policy onb_items_manager_update on onboarding_run_items for update
  using (is_manager()) with check (is_manager());

-- Employé: peut update SES propres items dont il est responsable
create policy onb_items_self_update on onboarding_run_items for update
  using (
    responsible_role = 'employee'
    and exists (
      select 1 from onboarding_runs r
      join employees e on e.id = r.employee_id
      where r.id = run_id and e.profile_id = auth.uid()
    )
  )
  with check (
    responsible_role = 'employee'
    and exists (
      select 1 from onboarding_runs r
      join employees e on e.id = r.employee_id
      where r.id = run_id and e.profile_id = auth.uid()
    )
  );

-- 4) Realtime
alter publication supabase_realtime add table onboarding_runs;
alter publication supabase_realtime add table onboarding_run_items;

-- 5) Trigger : à la création d'un employé, on instancie le run par défaut
create or replace function start_onboarding_for_new_employee()
returns trigger as $$
declare
  default_tpl uuid;
  new_run_id uuid;
begin
  select id into default_tpl from onboarding_templates where is_default = true limit 1;
  if default_tpl is null then return new; end if;

  -- évite double si déjà instancié
  if exists (select 1 from onboarding_runs where employee_id = new.id) then
    return new;
  end if;

  insert into onboarding_runs (employee_id, template_id) values (new.id, default_tpl) returning id into new_run_id;
  insert into onboarding_run_items (run_id, template_item_id, label, description, category, is_required, responsible_role, position)
  select new_run_id, t.id, t.label, t.description, t.category, t.is_required, t.responsible_role, t.position
  from onboarding_template_items t where t.template_id = default_tpl
  order by t.position;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_employee_created_onboarding
  after insert on employees
  for each row execute function start_onboarding_for_new_employee();

-- 6) Seed du template par défaut (boutique caftan, BE)
do $$
declare
  tpl_id uuid;
begin
  -- skip si déjà présent
  if exists (select 1 from onboarding_templates where is_default = true) then
    return;
  end if;

  insert into onboarding_templates (name, description, is_default)
  values ('Onboarding boutique standard',
          'Checklist d''accueil pour un·e nouveau·elle employé·e en boutique (Belgique).',
          true)
  returning id into tpl_id;

  insert into onboarding_template_items (template_id, position, label, description, category, is_required, responsible_role) values
    (tpl_id, 1,  'Contrat signé',                       'Contrat de travail signé par les deux parties.', 'legal',    true, 'rh'),
    (tpl_id, 2,  'Copie carte d''identité reçue',       'Récupérer une copie recto-verso de la CI.',       'admin',    true, 'rh'),
    (tpl_id, 3,  'NRN renseigné',                       'Numéro de registre national encodé dans la fiche.', 'admin',  true, 'rh'),
    (tpl_id, 4,  'IBAN renseigné',                      'Coordonnées bancaires complètes (IBAN + BIC).',   'admin',    true, 'rh'),
    (tpl_id, 5,  'Dimona effectuée',                    'Déclaration Dimona enregistrée auprès de l''ONSS.', 'legal',  true, 'rh'),
    (tpl_id, 6,  'Mutuelle déclarée',                   'Confirmer l''affiliation à une mutuelle.',         'admin',   true, 'employee'),
    (tpl_id, 7,  'Caisse d''allocations familiales',    'Communiquer la caisse d''allocations familiales.', 'admin',   true, 'employee'),
    (tpl_id, 8,  'Tenue de boutique remise',            'Tenue + badge nom remis le premier jour.',         'tools',   true, 'manager'),
    (tpl_id, 9,  'Badge / clé / accès remise',          'Badge magasin, clé de tiroir-caisse, code alarme.', 'tools',  true, 'manager'),
    (tpl_id, 10, 'Formation produits réalisée',         'Présentation gamme caftans et tarifs.',            'training', true, 'manager'),
    (tpl_id, 11, 'Présentation à l''équipe',            'Tour de boutique + présentation des collègues.',   'training', true, 'manager'),
    (tpl_id, 12, 'Premier shift planifié',              'Premier shift programmé dans le planning.',        'training', true, 'manager');
end $$;
