// Anomaly detection — pure heuristic functions, no AI required.
//
// Each detector returns a list of `AnomalyCandidate` rows (kind + target +
// severity + title + description + data). The cron route is responsible for
// inserting them into `anomaly_flags`, deduping against open flags, and
// notifying recipients.
//
// Keep these heuristics cheap : direct SQL queries, no external calls.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AnomalyKind =
  | "no_show_streak"
  | "score_drop"
  | "overdue_onboarding"
  | "student_quota_near"
  | "cdd_ending"
  | "trial_decision_due"
  | "shift_uncovered"
  | "ghost_employee";

export type AnomalySeverity = "info" | "warning" | "critical";

export type AnomalyTargetType = "employee" | "application" | "shift" | "department";

export type AnomalyCandidate = {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  target_type: AnomalyTargetType;
  target_id: string | null;
  title: string;
  description: string | null;
  data?: Record<string, unknown> | null;
};

const ANOMALY_LABELS: Record<AnomalyKind, string> = {
  no_show_streak: "Absences répétées",
  score_drop: "Score en chute",
  overdue_onboarding: "Onboarding en retard",
  student_quota_near: "Quota étudiant proche",
  cdd_ending: "Fin de CDD imminente",
  trial_decision_due: "Décision de fin d'essai",
  shift_uncovered: "Shift non couvert",
  ghost_employee: "Employé sans activité",
};

export function anomalyKindLabel(kind: string): string {
  return ANOMALY_LABELS[kind as AnomalyKind] ?? kind;
}

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0]!;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0]!;
}

/**
 * Employees with ≥ 2 shifts of status='no_show' in the last 30 days.
 * 2 → warning, ≥ 3 → critical.
 */
export async function detectNoShowStreaks(admin: SupabaseClient): Promise<AnomalyCandidate[]> {
  const since = daysAgoIso(30);
  const { data, error } = await admin
    .from("shifts")
    .select("employee_id, status, date")
    .eq("status", "no_show")
    .gte("date", since);
  if (error) {
    console.warn("[anomaly:no_show_streak]", error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{ employee_id: string; status: string; date: string }>;
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.employee_id, (counts.get(r.employee_id) ?? 0) + 1);
  }

  const targetIds = Array.from(counts.keys()).filter((k) => (counts.get(k) ?? 0) >= 2);
  if (targetIds.length === 0) return [];

  const { data: emps } = await admin.from("employees").select("id, full_name").in("id", targetIds);
  const nameById = new Map<string, string>();
  for (const e of (emps ?? []) as Array<{ id: string; full_name: string }>) {
    nameById.set(e.id, e.full_name);
  }

  const out: AnomalyCandidate[] = [];
  for (const empId of targetIds) {
    const c = counts.get(empId) ?? 0;
    const name = nameById.get(empId) ?? "Employé";
    out.push({
      kind: "no_show_streak",
      severity: c >= 3 ? "critical" : "warning",
      target_type: "employee",
      target_id: empId,
      title: `${name} : ${c} no-show sur 30 jours`,
      description:
        c >= 3
          ? "Plus de 3 absences non justifiées en 30 jours. Décision RH urgente."
          : "2 absences non justifiées en 30 jours. À surveiller.",
      data: { count: c, window_days: 30 },
    });
  }
  return out;
}

/**
 * Score drops : reliability_pct < 70 OR coverage_pct < 70.
 */
export async function detectScoreDrops(admin: SupabaseClient): Promise<AnomalyCandidate[]> {
  const { data, error } = await admin
    .from("employee_metrics")
    .select("employee_id, reliability_pct, coverage_pct");
  if (error) {
    console.warn("[anomaly:score_drop]", error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{
    employee_id: string;
    reliability_pct: number | null;
    coverage_pct: number | null;
  }>;
  const flagged = rows.filter(
    (r) => Number(r.reliability_pct ?? 100) < 70 || Number(r.coverage_pct ?? 100) < 70,
  );
  if (flagged.length === 0) return [];

  const ids = flagged.map((r) => r.employee_id);
  const { data: emps } = await admin
    .from("employees")
    .select("id, full_name, status")
    .in("id", ids)
    .eq("status", "active");
  const empMap = new Map<string, string>();
  for (const e of (emps ?? []) as Array<{ id: string; full_name: string }>) {
    empMap.set(e.id, e.full_name);
  }

  const out: AnomalyCandidate[] = [];
  for (const r of flagged) {
    const name = empMap.get(r.employee_id);
    if (!name) continue; // not active anymore
    const rel = Number(r.reliability_pct ?? 100);
    const cov = Number(r.coverage_pct ?? 100);
    const reasons: string[] = [];
    if (rel < 70) reasons.push(`fiabilité ${rel.toFixed(0)} %`);
    if (cov < 70) reasons.push(`couverture ${cov.toFixed(0)} %`);
    const isCritical = rel < 50 || cov < 50;
    out.push({
      kind: "score_drop",
      severity: isCritical ? "critical" : "warning",
      target_type: "employee",
      target_id: r.employee_id,
      title: `${name} : ${reasons.join(", ")}`,
      description: "KPI en baisse — entretien recommandé.",
      data: { reliability_pct: rel, coverage_pct: cov },
    });
  }
  return out;
}

/**
 * Employees hired ≥ 30 days ago whose onboarding_run is not completed
 * AND whose checklist is < 50 % done.
 */
export async function detectOverdueOnboarding(
  admin: SupabaseClient,
): Promise<AnomalyCandidate[]> {
  const cutoff = daysAgoIso(30);
  const { data: emps } = await admin
    .from("employees")
    .select("id, full_name, start_date")
    .eq("status", "active")
    .lte("start_date", cutoff);
  const empArr = (emps ?? []) as Array<{ id: string; full_name: string; start_date: string }>;
  if (empArr.length === 0) return [];

  const { data: runs } = await admin
    .from("onboarding_runs")
    .select("id, employee_id, completed_at")
    .in(
      "employee_id",
      empArr.map((e) => e.id),
    );
  const runArr = (runs ?? []) as Array<{
    id: string;
    employee_id: string;
    completed_at: string | null;
  }>;
  const openRuns = runArr.filter((r) => !r.completed_at);
  if (openRuns.length === 0) return [];

  const { data: items } = await admin
    .from("onboarding_run_items")
    .select("run_id, done_at")
    .in(
      "run_id",
      openRuns.map((r) => r.id),
    );
  const itemArr = (items ?? []) as Array<{ run_id: string; done_at: string | null }>;
  const stats = new Map<string, { total: number; done: number }>();
  for (const it of itemArr) {
    const cur = stats.get(it.run_id) ?? { total: 0, done: 0 };
    cur.total += 1;
    if (it.done_at) cur.done += 1;
    stats.set(it.run_id, cur);
  }

  const empById = new Map<string, { full_name: string; start_date: string }>();
  for (const e of empArr) empById.set(e.id, { full_name: e.full_name, start_date: e.start_date });

  const out: AnomalyCandidate[] = [];
  for (const r of openRuns) {
    const s = stats.get(r.id) ?? { total: 0, done: 0 };
    const pct = s.total > 0 ? (s.done / s.total) * 100 : 0;
    if (pct >= 50) continue;
    const emp = empById.get(r.employee_id);
    if (!emp) continue;
    const daysSinceStart = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(emp.start_date).getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    out.push({
      kind: "overdue_onboarding",
      severity: pct < 25 ? "critical" : "warning",
      target_type: "employee",
      target_id: r.employee_id,
      title: `${emp.full_name} : onboarding ${pct.toFixed(0)} % après ${daysSinceStart} j`,
      description: `${s.done}/${s.total} items cochés depuis ${daysSinceStart} jours.`,
      data: { run_id: r.id, done: s.done, total: s.total, pct, days_since_start: daysSinceStart },
    });
  }
  return out;
}

/**
 * Étudiants : worked hours over the last 365 days ≥ 90 % of annual_hours_budget.
 * Critical (≥ 100 %) → over quota.
 */
export async function detectStudentQuotaNear(
  admin: SupabaseClient,
): Promise<AnomalyCandidate[]> {
  const since = daysAgoIso(365);
  const { data: emps } = await admin
    .from("employees")
    .select("id, full_name, contract_type, annual_hours_budget")
    .eq("status", "active")
    .eq("contract_type", "Étudiant")
    .not("annual_hours_budget", "is", null);
  type Emp = { id: string; full_name: string; annual_hours_budget: number };
  const empArr = (emps ?? []) as unknown as Emp[];
  if (empArr.length === 0) return [];

  const out: AnomalyCandidate[] = [];
  for (const e of empArr) {
    const { data: shifts } = await admin
      .from("shifts")
      .select("start_time, end_time, break_minutes, status, date")
      .eq("employee_id", e.id)
      .gte("date", since)
      .in("status", ["done", "confirmed"]);
    let hours = 0;
    for (const s of (shifts ?? []) as Array<{
      start_time: string;
      end_time: string;
      break_minutes: number | null;
    }>) {
      const start = parseHm(s.start_time);
      const end = parseHm(s.end_time);
      const brk = (s.break_minutes ?? 0) / 60;
      const dur = Math.max(0, (end - start) / 60 - brk);
      hours += dur;
    }
    const budget = Number(e.annual_hours_budget);
    if (budget <= 0) continue;
    const pct = (hours / budget) * 100;
    if (pct < 90) continue;
    out.push({
      kind: "student_quota_near",
      severity: pct >= 100 ? "critical" : "warning",
      target_type: "employee",
      target_id: e.id,
      title: `${e.full_name} : ${hours.toFixed(0)} h / ${budget} h (${pct.toFixed(0)} %)`,
      description:
        pct >= 100
          ? "Dépasse son quota annuel d'heures étudiant — risque cotisations majorées."
          : "Approche le plafond annuel d'heures étudiant.",
      data: { hours_worked: Math.round(hours * 100) / 100, budget, pct: Math.round(pct) },
    });
  }
  return out;
}

function parseHm(t: string): number {
  // returns minutes since midnight from a "HH:MM[:SS]" string
  const parts = t.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return h * 60 + m;
}

/**
 * CDD ending in the next 30 days.
 */
export async function detectCddEnding(admin: SupabaseClient): Promise<AnomalyCandidate[]> {
  const today = isoDateOffset(0);
  const in30d = isoDateOffset(30);
  const { data } = await admin
    .from("employees")
    .select("id, full_name, contract_type, end_date")
    .eq("status", "active")
    .eq("contract_type", "CDD")
    .gte("end_date", today)
    .lte("end_date", in30d);

  type Emp = { id: string; full_name: string; end_date: string };
  return ((data ?? []) as unknown as Emp[]).map((e) => {
    const days = Math.max(
      0,
      Math.ceil(
        (new Date(e.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      ),
    );
    return {
      kind: "cdd_ending" as const,
      severity: days <= 7 ? "critical" : "warning",
      target_type: "employee" as const,
      target_id: e.id,
      title: `${e.full_name} : CDD se termine dans ${days} j`,
      description: `Fin de contrat le ${e.end_date}. Décider renouvellement ou non.`,
      data: { end_date: e.end_date, days_remaining: days },
    };
  });
}

/**
 * Employees with trial_end_date in the next 7 days and no recent decision.
 * Heuristic : we just flag based on trial_end_date proximity (decision logging
 * is not yet wired in the schema — this surfaces the situation to RH).
 */
export async function detectTrialDecisionDue(
  admin: SupabaseClient,
): Promise<AnomalyCandidate[]> {
  const today = isoDateOffset(0);
  const in7d = isoDateOffset(7);
  const { data } = await admin
    .from("employees")
    .select("id, full_name, trial_end_date, contract_type")
    .eq("status", "active")
    .gte("trial_end_date", today)
    .lte("trial_end_date", in7d);

  type Emp = { id: string; full_name: string; trial_end_date: string; contract_type: string | null };
  return ((data ?? []) as unknown as Emp[]).map((e) => {
    const days = Math.max(
      0,
      Math.ceil(
        (new Date(e.trial_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      ),
    );
    return {
      kind: "trial_decision_due" as const,
      severity: "critical" as const,
      target_type: "employee" as const,
      target_id: e.id,
      title: `${e.full_name} : décision essai sous ${days} j`,
      description: `Période d'essai ${e.contract_type ?? "?"} se termine le ${e.trial_end_date}.`,
      data: { trial_end_date: e.trial_end_date, days_remaining: days },
    };
  });
}

/**
 * Active employees with no shift planned over the next 7 days (likely "ghost" / oubliés).
 * Skipped if employee.start_date is in the future (n'a pas démarré) ou status != active.
 * Heuristic light : no shift at all in next 7 days for an active employee.
 */
export async function detectShiftUncovered(
  admin: SupabaseClient,
): Promise<AnomalyCandidate[]> {
  const today = isoDateOffset(0);
  const in7d = isoDateOffset(7);

  const { data: emps } = await admin
    .from("employees")
    .select("id, full_name, start_date")
    .eq("status", "active")
    .lte("start_date", today);
  const empArr = (emps ?? []) as Array<{ id: string; full_name: string; start_date: string }>;
  if (empArr.length === 0) return [];

  const empIds = empArr.map((e) => e.id);
  const { data: shifts } = await admin
    .from("shifts")
    .select("employee_id")
    .in("employee_id", empIds)
    .gte("date", today)
    .lte("date", in7d)
    .in("status", ["planned", "confirmed", "done"]);
  const scheduled = new Set(
    ((shifts ?? []) as Array<{ employee_id: string }>).map((s) => s.employee_id),
  );

  // We also exclude employees on approved time off this week.
  const { data: offs } = await admin
    .from("time_off_requests")
    .select("employee_id, start_date, end_date, status")
    .in("employee_id", empIds)
    .eq("status", "approved")
    .lte("start_date", in7d)
    .gte("end_date", today);
  const onLeave = new Set(
    ((offs ?? []) as Array<{ employee_id: string }>).map((o) => o.employee_id),
  );

  const out: AnomalyCandidate[] = [];
  for (const e of empArr) {
    if (scheduled.has(e.id) || onLeave.has(e.id)) continue;
    out.push({
      kind: "ghost_employee",
      severity: "info",
      target_type: "employee",
      target_id: e.id,
      title: `${e.full_name} : aucun shift planifié cette semaine`,
      description: "Aucun shift sur les 7 prochains jours et pas de congé approuvé.",
      data: { window_days: 7 },
    });
  }
  return out;
}

/**
 * Run all detectors. Returns a flat array of candidates.
 */
export async function runAllDetectors(admin: SupabaseClient): Promise<AnomalyCandidate[]> {
  const all = await Promise.all([
    detectNoShowStreaks(admin).catch((e) => {
      console.warn("[anomaly:no_show_streak]", (e as Error).message);
      return [] as AnomalyCandidate[];
    }),
    detectScoreDrops(admin).catch((e) => {
      console.warn("[anomaly:score_drop]", (e as Error).message);
      return [] as AnomalyCandidate[];
    }),
    detectOverdueOnboarding(admin).catch((e) => {
      console.warn("[anomaly:overdue_onboarding]", (e as Error).message);
      return [] as AnomalyCandidate[];
    }),
    detectStudentQuotaNear(admin).catch((e) => {
      console.warn("[anomaly:student_quota_near]", (e as Error).message);
      return [] as AnomalyCandidate[];
    }),
    detectCddEnding(admin).catch((e) => {
      console.warn("[anomaly:cdd_ending]", (e as Error).message);
      return [] as AnomalyCandidate[];
    }),
    detectTrialDecisionDue(admin).catch((e) => {
      console.warn("[anomaly:trial_decision_due]", (e as Error).message);
      return [] as AnomalyCandidate[];
    }),
    detectShiftUncovered(admin).catch((e) => {
      console.warn("[anomaly:shift_uncovered]", (e as Error).message);
      return [] as AnomalyCandidate[];
    }),
  ]);
  return all.flat();
}
