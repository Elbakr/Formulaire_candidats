// Calcul des quotas sur une periode arbitraire (1 sem / 4 sem / 12 sem / mois).
// Etend lib/quotas.ts (focus "semaine en cours") pour vue temporelle direction.
// Karim 14/05/2026.

import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  startOfWeek,
  toISODate,
  shiftHours,
  parseISODate,
} from "@/lib/planning";

export type PeriodKey = "this_week" | "next_week" | "4w" | "12w" | "this_month";

export type SiteCoverageRow = {
  site_id: string;
  site_code: string;
  site_name: string;
  site_color: string | null;
  /** Heures requises sur la periode (somme des site_needs * jours_actifs) */
  required_hours: number;
  /** Heures contractuelles planifiees sur la periode */
  contractual_hours: number;
  /** Heures OT planifiees sur la periode */
  overtime_hours: number;
  /** Deficit en heures (positif = manque, negatif = surplus) */
  deficit_hours: number;
  /** Couverture en % */
  coverage_pct: number;
  /** Nb estime de shifts manquants (deficit / 7h moyen) */
  missing_shifts_estimate: number;
  band: "danger" | "warn" | "ok" | "over";
};

export type EmployeePeriodRow = {
  employee: {
    id: string;
    full_name: string;
    contract_type: string | null;
    weekly_hours: number | null;
  };
  weeksInPeriod: number;
  /** Heures planifiees totales sur la periode (contractuel + OT) */
  planned_hours: number;
  /** Heures contractuelles uniquement */
  contractual_hours: number;
  overtime_hours: number;
  /** Target hebdo * nb_semaines_periode */
  target_hours: number;
  /** Ratio planned / target */
  progress: number;
  band: "ok" | "warn" | "over" | "under";
};

export type PeriodQuotas = {
  period: PeriodKey;
  startISO: string;
  endISO: string;
  weeksInPeriod: number;
  kpi: {
    total_required_hours: number;
    total_planned_hours: number;
    total_contractual_hours: number;
    total_overtime_hours: number;
    total_deficit_hours: number;
    coverage_pct: number;
    employees_under: number;
    employees_over: number;
    sites_in_danger: number;
  };
  sites: SiteCoverageRow[];
  employees: EmployeePeriodRow[];
};

export function periodBounds(period: PeriodKey, now: Date = new Date()) {
  const monday = startOfWeek(now);
  switch (period) {
    case "this_week": {
      return { start: monday, end: addDays(monday, 6) };
    }
    case "next_week": {
      const m = addDays(monday, 7);
      return { start: m, end: addDays(m, 6) };
    }
    case "4w": {
      return { start: monday, end: addDays(monday, 27) };
    }
    case "12w": {
      return { start: monday, end: addDays(monday, 83) };
    }
    case "this_month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: s, end: e };
    }
  }
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function slotElapsedHours(start: string, end: string): number {
  return (timeToMin(end) - timeToMin(start)) / 60;
}

function bandFromDeficitPct(pct: number): SiteCoverageRow["band"] {
  if (pct > 0.4) return "danger";
  if (pct > 0.15) return "warn";
  if (pct >= -0.15) return "ok";
  return "over";
}

export async function loadQuotasForPeriod(period: PeriodKey): Promise<PeriodQuotas> {
  const supabase = await createClient();
  const { start, end } = periodBounds(period);
  const startISO = toISODate(start);
  const endISO = toISODate(end);

  // Nombre de jours = (end - start) / DAY + 1, weeks = days / 7.
  const dayMs = 24 * 3600 * 1000;
  const days = Math.round(
    (parseISODate(endISO).getTime() - parseISODate(startISO).getTime()) / dayMs,
  ) + 1;
  const weeksInPeriod = days / 7;

  const [
    { data: sitesRaw },
    { data: empsRaw },
    { data: needsRaw },
    { data: shiftsRaw },
  ] = await Promise.all([
    supabase
      .from("sites")
      .select("id, code, name, color")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("employees")
      .select("id, full_name, contract_type, weekly_hours")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("site_needs")
      .select("site_id, day_of_week, start_time, end_time, headcount, is_enabled")
      .eq("is_enabled", true),
    supabase
      .from("shifts")
      .select("employee_id, site_id, date, start_time, end_time, break_minutes, is_overtime")
      .gte("date", startISO)
      .lte("date", endISO),
  ]);

  const sites = (sitesRaw ?? []) as Array<{
    id: string; code: string; name: string; color: string | null;
  }>;
  const emps = (empsRaw ?? []) as Array<{
    id: string; full_name: string; contract_type: string | null; weekly_hours: number | null;
  }>;
  const needs = (needsRaw ?? []) as Array<{
    site_id: string; day_of_week: number; start_time: string; end_time: string; headcount: number; is_enabled: boolean;
  }>;
  const shifts = (shiftsRaw ?? []) as Array<{
    employee_id: string; site_id: string | null; date: string; start_time: string; end_time: string; break_minutes: number; is_overtime: boolean | null;
  }>;

  // 1. Compte les occurrences de chaque day_of_week dans la periode.
  const dowCounts = new Map<number, number>();
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const dow = d.getDay();
    dowCounts.set(dow, (dowCounts.get(dow) ?? 0) + 1);
  }

  // 2. Calcul des heures requises par site (somme des needs * occurrences).
  const requiredBySite = new Map<string, number>();
  for (const n of needs) {
    const slotH = slotElapsedHours(n.start_time, n.end_time);
    const occ = dowCounts.get(n.day_of_week) ?? 0;
    const req = slotH * n.headcount * occ;
    requiredBySite.set(n.site_id, (requiredBySite.get(n.site_id) ?? 0) + req);
  }

  // 3. Heures planifiees par site (contractuel / OT).
  const plannedBySite = new Map<string, { c: number; o: number }>();
  const plannedByEmp = new Map<string, { c: number; o: number }>();
  for (const s of shifts) {
    const h = shiftHours(s.start_time.slice(0, 5), s.end_time.slice(0, 5), s.break_minutes ?? 0);
    if (s.site_id) {
      const cur = plannedBySite.get(s.site_id) ?? { c: 0, o: 0 };
      if (s.is_overtime) cur.o += h;
      else cur.c += h;
      plannedBySite.set(s.site_id, cur);
    }
    const ce = plannedByEmp.get(s.employee_id) ?? { c: 0, o: 0 };
    if (s.is_overtime) ce.o += h;
    else ce.c += h;
    plannedByEmp.set(s.employee_id, ce);
  }

  // 4. Construit lignes sites.
  const siteRows: SiteCoverageRow[] = [];
  for (const site of sites) {
    const required = requiredBySite.get(site.id) ?? 0;
    const planned = plannedBySite.get(site.id) ?? { c: 0, o: 0 };
    const total = planned.c + planned.o;
    const deficit = required - total;
    const coveragePct = required > 0 ? (total / required) * 100 : (total > 0 ? 999 : 100);
    const deficitPct = required > 0 ? deficit / required : 0;
    siteRows.push({
      site_id: site.id,
      site_code: site.code,
      site_name: site.name,
      site_color: site.color,
      required_hours: required,
      contractual_hours: planned.c,
      overtime_hours: planned.o,
      deficit_hours: deficit,
      coverage_pct: coveragePct,
      missing_shifts_estimate: deficit > 0 ? Math.ceil(deficit / 7) : 0,
      band: bandFromDeficitPct(deficitPct),
    });
  }
  siteRows.sort((a, b) => b.deficit_hours - a.deficit_hours);

  // 5. Construit lignes employees.
  const empRows: EmployeePeriodRow[] = [];
  for (const e of emps) {
    const planned = plannedByEmp.get(e.id) ?? { c: 0, o: 0 };
    const weeklyTarget = e.weekly_hours ?? 38;
    const targetHours = weeklyTarget * weeksInPeriod;
    const totalPlanned = planned.c + planned.o;
    const progress = targetHours > 0 ? totalPlanned / targetHours : 0;
    let band: EmployeePeriodRow["band"] = "ok";
    if (progress > 1.05) band = "over";
    else if (progress >= 0.9) band = "warn";
    else if (progress < 0.6) band = "under";
    empRows.push({
      employee: e,
      weeksInPeriod,
      planned_hours: totalPlanned,
      contractual_hours: planned.c,
      overtime_hours: planned.o,
      target_hours: targetHours,
      progress,
      band,
    });
  }
  empRows.sort((a, b) => {
    // Priorite : ceux qui debordent (over), puis under, puis ok
    const ord = { over: 0, warn: 1, under: 2, ok: 3 } as const;
    const da = ord[a.band];
    const db = ord[b.band];
    if (da !== db) return da - db;
    return Math.abs(b.progress - 1) - Math.abs(a.progress - 1);
  });

  // 6. KPI globaux.
  const totalRequired = siteRows.reduce((a, s) => a + s.required_hours, 0);
  const totalContractual = siteRows.reduce((a, s) => a + s.contractual_hours, 0);
  const totalOvertime = siteRows.reduce((a, s) => a + s.overtime_hours, 0);
  const totalPlanned = totalContractual + totalOvertime;
  const totalDeficit = totalRequired - totalPlanned;
  const coveragePct = totalRequired > 0 ? (totalPlanned / totalRequired) * 100 : 100;
  const employeesUnder = empRows.filter((r) => r.band === "under").length;
  const employeesOver = empRows.filter((r) => r.band === "over").length;
  const sitesInDanger = siteRows.filter((r) => r.band === "danger").length;

  return {
    period,
    startISO,
    endISO,
    weeksInPeriod,
    kpi: {
      total_required_hours: totalRequired,
      total_planned_hours: totalPlanned,
      total_contractual_hours: totalContractual,
      total_overtime_hours: totalOvertime,
      total_deficit_hours: totalDeficit,
      coverage_pct: coveragePct,
      employees_under: employeesUnder,
      employees_over: employeesOver,
      sites_in_danger: sitesInDanger,
    },
    sites: siteRows,
    employees: empRows,
  };
}
