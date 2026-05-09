-- Vague 5 — Anomaly detection
--
-- Table `anomaly_flags` stocke les alertes générées par le scan quotidien
-- (cron `/api/cron/anomaly-scan`). Chaque flag est ouvert tant que
-- `resolved_at IS NULL`. La sévérité est `info | warning | critical`.
--
-- Le champ `kind` couvre :
--   no_show_streak, score_drop, overdue_onboarding, student_quota_near,
--   cdd_ending, trial_decision_due, shift_uncovered, ghost_employee
--
-- Realtime activé pour rafraîchir l'UI Admin > Anomalies en temps réel.

create type anomaly_severity as enum ('info','warning','critical');

create table anomaly_flags (
  id uuid primary key default uuid_generate_v4(),
  kind text not null,
  severity anomaly_severity not null default 'warning',
  target_type text not null,    -- 'employee' | 'application' | 'shift' | 'department'
  target_id uuid,
  title text not null,
  description text,
  data jsonb,
  ai_audit_id uuid references ai_audit(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  resolved_reason text,
  detected_at timestamptz not null default now()
);
create index idx_anomalies_open on anomaly_flags (severity, detected_at desc) where resolved_at is null;
create index idx_anomalies_target on anomaly_flags (target_type, target_id, detected_at desc);

alter table anomaly_flags enable row level security;
create policy anomalies_read on anomaly_flags for select using (is_manager());
create policy anomalies_rh_write on anomaly_flags for all using (is_rh()) with check (is_rh());

alter publication supabase_realtime add table anomaly_flags;
