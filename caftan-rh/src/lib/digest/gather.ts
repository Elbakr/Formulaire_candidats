// Daily digest — agrégation des stats à envoyer au LLM.
//
// gatherDigestStats(periodHours) : compile en parallèle :
//  - applications créées sur la période
//  - applications dont status a changé
//  - time_off_requests pending
//  - interviews dans les 24h
//  - documents validation_status='pending'
//  - agent_actions status='proposed'
//  - employees fin essai dans 14 jours
//  - top 3 employees (score sur 12 mois)
//  - top 3 employees needing attention (score bas, no_shows, onboarding incomplet)

import { createAdminClient } from "@/lib/supabase/server";

export type DigestPendingAction = {
  kind: string;
  target_label?: string | null;
  age_hours?: number;
};

export type DigestAnomaly = { kind: string; description: string };

export type DigestStats = {
  new_applications: number;
  status_changed_applications: number;
  pending_time_off: number;
  interviews_next_24h: number;
  documents_pending_validation: number;
  agent_actions_proposed: number;
  trial_endings_next_14d: number;
  top_employees: Array<{ id: string; full_name: string; reliability_pct: number | null }>;
  attention_employees: Array<{
    id: string;
    full_name: string;
    reason: string;
  }>;
};

export type DigestBundle = {
  stats: DigestStats;
  pending_actions: DigestPendingAction[];
  anomalies: DigestAnomaly[];
};

function hoursBetween(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
}

export async function gatherDigestStats(periodHours = 12): Promise<DigestBundle> {
  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - periodHours * 3_600_000).toISOString();
  const todayIso = new Date().toISOString().split("T")[0];
  const in24h = new Date(Date.now() + 24 * 3_600_000).toISOString();
  const in14dDate = new Date(Date.now() + 14 * 86_400_000).toISOString().split("T")[0];

  const [
    newAppsRes,
    statusChangedRes,
    pendingTimeOffRes,
    interviewsRes,
    docsPendingRes,
    actionsProposedRes,
    trialEndingRes,
    topMetricsRes,
    attentionMetricsRes,
  ] = await Promise.all([
    admin
      .from("applications")
      .select("id, created_at, status, candidate:candidates(full_name)", { count: "exact" })
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false }),
    admin
      .from("applications")
      .select("id, status, updated_at, candidate:candidates(full_name)")
      .gte("updated_at", sinceIso)
      .lt("created_at", sinceIso)
      .order("updated_at", { ascending: false })
      .limit(50),
    admin
      .from("time_off_requests")
      .select("id, kind, start_date, end_date, created_at, employee:employees(full_name)", {
        count: "exact",
      })
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    admin
      .from("interviews")
      .select("id, scheduled_at, status, application:applications(candidate:candidates(full_name))")
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .lte("scheduled_at", in24h)
      .order("scheduled_at", { ascending: true }),
    admin
      .from("documents")
      .select("id, file_name, validation_status", { count: "exact" })
      .eq("validation_status", "pending"),
    admin
      .from("agent_actions")
      .select("id, kind, proposed_at, target_type, target_id", { count: "exact" })
      .eq("status", "proposed")
      .order("proposed_at", { ascending: false })
      .limit(50),
    admin
      .from("employees")
      .select("id, full_name, trial_end_date")
      .eq("status", "active")
      .gte("trial_end_date", todayIso)
      .lte("trial_end_date", in14dDate),
    admin
      .from("employee_metrics")
      .select(
        "employee_id, reliability_pct, shifts_no_show, employee:employees(id, full_name, status)",
      )
      .order("reliability_pct", { ascending: false })
      .limit(50),
    admin
      .from("employee_metrics")
      .select(
        "employee_id, reliability_pct, shifts_no_show, employee:employees(id, full_name, status)",
      )
      .order("reliability_pct", { ascending: true })
      .limit(50),
  ]);

  type AppCand = { id: string; status: string; updated_at?: string; created_at?: string; candidate: { full_name?: string } | null };
  type TOff = {
    id: string;
    kind: string;
    start_date: string;
    end_date: string;
    created_at: string;
    employee: { full_name?: string } | null;
  };
  type Itv = {
    id: string;
    scheduled_at: string;
    status: string;
    application: { candidate: { full_name?: string } | null } | null;
  };
  type Action = {
    id: string;
    kind: string;
    proposed_at: string;
    target_type: string | null;
    target_id: string | null;
  };
  type EmpMetric = {
    employee_id: string;
    reliability_pct: number | null;
    shifts_no_show: number | null;
    employee: { id?: string; full_name?: string; status?: string } | null;
  };

  const newApps = (newAppsRes.data ?? []) as unknown as AppCand[];
  const statusChanged = (statusChangedRes.data ?? []) as unknown as AppCand[];
  const pendingTimeOff = (pendingTimeOffRes.data ?? []) as unknown as TOff[];
  const interviews = (interviewsRes.data ?? []) as unknown as Itv[];
  const docsPending = docsPendingRes.count ?? 0;
  const actionsProposed = (actionsProposedRes.data ?? []) as unknown as Action[];
  const trialEnding = (trialEndingRes.data ?? []) as unknown as Array<{
    id: string;
    full_name: string;
    trial_end_date: string;
  }>;
  const topMetrics = (topMetricsRes.data ?? []) as unknown as EmpMetric[];
  const attentionMetrics = (attentionMetricsRes.data ?? []) as unknown as EmpMetric[];

  const top_employees = topMetrics
    .filter((m) => m.employee?.status === "active" && (m.reliability_pct ?? 0) >= 90)
    .slice(0, 3)
    .map((m) => ({
      id: m.employee?.id ?? m.employee_id,
      full_name: m.employee?.full_name ?? "?",
      reliability_pct: m.reliability_pct,
    }));

  const attention_employees = attentionMetrics
    .filter(
      (m) =>
        m.employee?.status === "active" &&
        ((m.reliability_pct !== null && (m.reliability_pct ?? 100) < 80) ||
          (m.shifts_no_show ?? 0) >= 2),
    )
    .slice(0, 3)
    .map((m) => ({
      id: m.employee?.id ?? m.employee_id,
      full_name: m.employee?.full_name ?? "?",
      reason:
        (m.shifts_no_show ?? 0) >= 2
          ? `${m.shifts_no_show} no-shows / 12m`
          : `Fiabilité ${Number(m.reliability_pct ?? 0).toFixed(0)}%`,
    }));

  const stats: DigestStats = {
    new_applications: newAppsRes.count ?? newApps.length,
    status_changed_applications: statusChanged.length,
    pending_time_off: pendingTimeOffRes.count ?? pendingTimeOff.length,
    interviews_next_24h: interviews.length,
    documents_pending_validation: docsPending,
    agent_actions_proposed: actionsProposedRes.count ?? actionsProposed.length,
    trial_endings_next_14d: trialEnding.length,
    top_employees,
    attention_employees,
  };

  // Build pending_actions list (max ~30)
  const pending_actions: DigestPendingAction[] = [];

  for (const t of pendingTimeOff.slice(0, 10)) {
    pending_actions.push({
      kind: "time_off_pending",
      target_label: `${t.employee?.full_name ?? "?"} (${t.start_date} → ${t.end_date})`,
      age_hours: hoursBetween(t.created_at),
    });
  }

  for (const a of actionsProposed.slice(0, 10)) {
    pending_actions.push({
      kind: a.kind,
      target_label: `${a.target_type ?? "?"}/${a.target_id ?? "?"}`,
      age_hours: hoursBetween(a.proposed_at),
    });
  }

  for (const it of interviews.slice(0, 5)) {
    pending_actions.push({
      kind: "interview_upcoming",
      target_label: `${it.application?.candidate?.full_name ?? "?"} — ${it.scheduled_at}`,
    });
  }

  // Anomalies
  const anomalies: DigestAnomaly[] = [];
  for (const e of trialEnding) {
    anomalies.push({
      kind: "trial_end_soon",
      description: `${e.full_name} : fin d'essai le ${e.trial_end_date}`,
    });
  }
  for (const e of attention_employees) {
    anomalies.push({
      kind: "employee_attention",
      description: `${e.full_name} : ${e.reason}`,
    });
  }
  if (docsPending > 5) {
    anomalies.push({
      kind: "docs_backlog",
      description: `${docsPending} documents en attente de validation`,
    });
  }
  if (stats.agent_actions_proposed > 10) {
    anomalies.push({
      kind: "inbox_backlog",
      description: `${stats.agent_actions_proposed} actions IA en attente dans l'Inbox`,
    });
  }

  return { stats, pending_actions, anomalies };
}
