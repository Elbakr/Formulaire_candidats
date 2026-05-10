// Module 5 — helpers partagés entre cockpit admin / manager / employé.
// Calcul léger côté serveur sans déclencher de recompute lourd.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ScoreRow = {
  employee_id: string;
  full_name: string;
  job_title: string | null;
  department_name: string | null;
  manager_id: string | null;
  global_score: number | null;
  reliability_pct: number | null;
  coverage_pct: number | null;
};

export type RiskRow = ScoreRow & {
  reasons: string[];
};

/** Top N performers (filtrable par manager si nécessaire). */
export async function fetchTopPerformers(
  supabase: SupabaseClient,
  opts: { managerId?: string | null; limit?: number },
): Promise<ScoreRow[]> {
  let q = supabase
    .from("employee_scores")
    .select("employee_id, full_name, job_title, department_name, manager_id, global_score, reliability_pct, coverage_pct")
    .eq("status", "active")
    .order("global_score", { ascending: false })
    .limit(opts.limit ?? 5);
  if (opts.managerId) q = q.eq("manager_id", opts.managerId);
  const { data } = await q;
  return ((data ?? []) as unknown) as ScoreRow[];
}

/** Employés à risque : score < 50 OU baisse > 20% sur 30j. */
export async function fetchAtRisk(
  supabase: SupabaseClient,
  opts: { managerId?: string | null; limit?: number },
): Promise<RiskRow[]> {
  let q = supabase
    .from("employee_scores")
    .select("employee_id, full_name, job_title, department_name, manager_id, global_score, reliability_pct, coverage_pct")
    .eq("status", "active")
    .order("global_score", { ascending: true })
    .limit(opts.limit ?? 5);
  if (opts.managerId) q = q.eq("manager_id", opts.managerId);
  const { data } = await q;
  const rows = ((data ?? []) as unknown) as ScoreRow[];
  return rows
    .filter((r) => Number(r.global_score ?? 100) < 60)
    .map((r) => {
      const reasons: string[] = [];
      const score = Number(r.global_score ?? 100);
      if (score < 50) reasons.push(`Score < 50 (${score.toFixed(0)})`);
      const rel = Number(r.reliability_pct ?? 100);
      if (rel < 80) reasons.push(`Fiabilité ${rel.toFixed(0)}%`);
      const cov = Number(r.coverage_pct ?? 100);
      if (cov < 80) reasons.push(`Couverture ${cov.toFixed(0)}%`);
      if (reasons.length === 0) reasons.push("Score sous la moyenne");
      return { ...r, reasons };
    });
}

/** Alertes CDD <= 30 jours, avec ou sans recommendation préparée. */
export async function fetchUpcomingCddEnds(
  supabase: SupabaseClient,
  opts: { managerId?: string | null; limit?: number },
): Promise<
  Array<{
    employee_id: string;
    full_name: string;
    end_date: string;
    days_remaining: number;
    has_pending: boolean;
  }>
> {
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const horizonISO = new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  let q = supabase
    .from("employees")
    .select("id, full_name, end_date, contract_type, manager_id")
    .eq("status", "active")
    .ilike("contract_type", "%CDD%")
    .not("end_date", "is", null)
    .gte("end_date", todayISO)
    .lte("end_date", horizonISO)
    .order("end_date", { ascending: true })
    .limit(opts.limit ?? 10);
  if (opts.managerId) q = q.eq("manager_id", opts.managerId);
  const { data } = await q;
  type Emp = {
    id: string;
    full_name: string;
    end_date: string;
    contract_type: string | null;
    manager_id: string | null;
  };
  const emps = (data ?? []) as Emp[];
  if (emps.length === 0) return [];

  const ids = emps.map((e) => e.id);
  const endDates = [...new Set(emps.map((e) => e.end_date))];
  const { data: recos } = await supabase
    .from("cdd_renewal_recommendations")
    .select("employee_id, contract_end_date, status")
    .in("employee_id", ids)
    .in("contract_end_date", endDates);
  type Reco = { employee_id: string; contract_end_date: string; status: string };
  const recoSet = new Set(
    ((recos ?? []) as Reco[])
      .filter((r) => ["pending", "discussing"].includes(r.status))
      .map((r) => `${r.employee_id}|${r.contract_end_date}`),
  );

  return emps.map((e) => {
    const target = new Date(e.end_date);
    const days = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
    return {
      employee_id: e.id,
      full_name: e.full_name,
      end_date: e.end_date,
      days_remaining: Math.max(0, days),
      has_pending: recoSet.has(`${e.id}|${e.end_date}`),
    };
  });
}

/** Absentéisme anormal : > 3 absences imprévues sur 60j. */
export async function fetchUnusualAbsenteeism(
  supabase: SupabaseClient,
  opts: { managerId?: string | null; limit?: number },
): Promise<
  Array<{ employee_id: string; full_name: string; absence_count: number }>
> {
  const today = new Date();
  const sinceISO = new Date(today.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
  // Pull absences then group, simpler than a custom RPC.
  const { data } = await supabase
    .from("unplanned_absences")
    .select("employee_id, employees(full_name, manager_id, status)")
    .gte("date", sinceISO);
  type Row = {
    employee_id: string;
    employees: { full_name: string; manager_id: string | null; status: string } | null;
  };
  const rows = ((data ?? []) as unknown) as Row[];
  const byEmp = new Map<string, { full_name: string; count: number; manager_id: string | null; status: string }>();
  for (const r of rows) {
    if (!r.employees) continue;
    if (r.employees.status !== "active") continue;
    if (opts.managerId && r.employees.manager_id !== opts.managerId) continue;
    const cur = byEmp.get(r.employee_id);
    if (cur) {
      cur.count += 1;
    } else {
      byEmp.set(r.employee_id, {
        full_name: r.employees.full_name,
        count: 1,
        manager_id: r.employees.manager_id,
        status: r.employees.status,
      });
    }
  }
  return [...byEmp.entries()]
    .filter(([, v]) => v.count > 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, opts.limit ?? 5)
    .map(([employee_id, v]) => ({
      employee_id,
      full_name: v.full_name,
      absence_count: v.count,
    }));
}
