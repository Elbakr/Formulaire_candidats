-- Brouillons de planning auto-générés chaque dimanche pour la semaine
-- suivante. Le manager valide en 1 clic depuis /planning/auto-drafts ou
-- ouvre la semaine pour modifier d'abord.
--
-- Idempotente.

create table if not exists auto_plan_drafts (
  id uuid primary key default uuid_generate_v4(),
  site_id uuid not null references sites(id) on delete cascade,
  week_monday date not null,
  generated_at timestamptz not null default now(),
  generated_by text not null default 'cron',  -- 'cron' | 'manual'
  status text not null default 'pending',     -- 'pending' | 'approved' | 'rejected'
  drafts_json jsonb not null,
  uncovered_json jsonb,
  contract_usage_json jsonb,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  unique (site_id, week_monday, status)
);
create index if not exists idx_auto_drafts_pending on auto_plan_drafts (status, week_monday);
create index if not exists idx_auto_drafts_site on auto_plan_drafts (site_id, week_monday);

alter table auto_plan_drafts enable row level security;
drop policy if exists apd_manager_all on auto_plan_drafts;
create policy apd_manager_all on auto_plan_drafts for all
  using (is_manager()) with check (is_manager());

do $$ begin
  begin alter publication supabase_realtime add table auto_plan_drafts; exception when duplicate_object then null; end;
end $$;
