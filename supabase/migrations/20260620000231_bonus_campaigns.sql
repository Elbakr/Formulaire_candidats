-- Système primes / concours équipe.
--
-- Deux tables :
--   * bonus_campaigns : la définition d'un concours (période, règle, budget,
--                       distribution des prix, scope site/global).
--   * bonus_awards    : les attributions effectives (un par employé gagnant).
--
-- Règles disponibles (rule_kind) :
--   - top_attendance : top N en heures pointées sans anomalie
--   - top_score      : top N en score moyen (KPI agrégé)
--   - top_seller     : V1 désactivé (WooCommerce non intégré)
--   - no_absence     : tous les employés sans absence imprévue
--   - custom         : attribution manuelle par l'admin
--
-- Lecture campagnes : tout le monde (les vendeuses doivent voir le concours).
-- Lecture awards    : RH/admin globalement, ou employé concerné (auto-vue).
-- Écriture          : RH/admin uniquement.
--
-- Idempotent.

create table if not exists bonus_campaigns (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  start_date date not null,
  end_date date not null,
  rule_kind text not null check (rule_kind in ('top_attendance','top_score','top_seller','no_absence','custom')),
  budget_total numeric(10,2),
  per_person_max numeric(10,2),
  prize_distribution jsonb,                -- ex. [{rank:1,amount:50},{rank:2,amount:30}]
  scope_site_id uuid references sites(id) on delete set null, -- null = tous les sites
  is_active boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_bonus_campaigns_window
  on bonus_campaigns (start_date, end_date)
  where is_active is true;

create table if not exists bonus_awards (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references bonus_campaigns(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  amount numeric(10,2) not null,
  rank int,
  reason text,
  paid_at timestamptz,
  created_at timestamptz default now(),
  unique (campaign_id, employee_id)
);
create index if not exists idx_bonus_awards_emp on bonus_awards (employee_id);
create index if not exists idx_bonus_awards_camp on bonus_awards (campaign_id);

alter table bonus_campaigns enable row level security;
alter table bonus_awards    enable row level security;

drop policy if exists bc_admin on bonus_campaigns;
drop policy if exists bc_read  on bonus_campaigns;
drop policy if exists ba_admin on bonus_awards;
drop policy if exists ba_self  on bonus_awards;

create policy bc_admin on bonus_campaigns for all    using (is_rh()) with check (is_rh());
create policy bc_read  on bonus_campaigns for select using (true);

create policy ba_admin on bonus_awards    for all    using (is_rh()) with check (is_rh());
create policy ba_self  on bonus_awards    for select using (
  exists (select 1 from employees e where e.id = bonus_awards.employee_id and e.profile_id = auth.uid())
);

do $$ begin
  begin alter publication supabase_realtime add table bonus_campaigns; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table bonus_awards;    exception when duplicate_object then null; end;
end $$;
