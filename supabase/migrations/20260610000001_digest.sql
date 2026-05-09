-- Vague 4 — Daily digest : table digest_runs
-- Stocke chaque run (matin / soir), markdown généré par l'IA, top 3 priorités,
-- snapshot des stats, et un lien vers l'audit IA correspondant.

create table digest_runs (
  id uuid primary key default uuid_generate_v4(),
  slot text not null,             -- 'morning' | 'evening'
  for_date date not null,
  markdown_summary text,
  top_3_priorities jsonb,
  stats_snapshot jsonb,
  ai_audit_id uuid references ai_audit(id) on delete set null,
  cost_usd numeric(10,6),
  recipients_count integer default 0,
  created_at timestamptz not null default now()
);
create index idx_digest_runs_recent on digest_runs (for_date desc, slot);

alter table digest_runs enable row level security;
create policy digest_runs_rh_read on digest_runs for select using (is_rh());
create policy digest_runs_rh_write on digest_runs for all using (is_rh()) with check (is_rh());
