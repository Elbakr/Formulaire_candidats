// Module SERVER-ONLY (utilise next/headers via supabase/server). Ne pas
// importer depuis un fichier "use client". Les types sont dans
// `./quotas-types.ts`.
import { createClient } from "@/lib/supabase/server";
import { addDays, startOfWeek, toISODate, weekRange, shiftHours } from "@/lib/planning";

export type { QuotaSnapshot, EmployeeQuotaRow } from "./quotas-types";
import type { QuotaSnapshot, EmployeeQuotaRow } from "./quotas-types";

type ShiftRow = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
};

const MONTH_RATIO = 4.33;

function isStudent(contractType: string | null | undefined): boolean {
  if (!contractType) return false;
  const c = contractType.toLowerCase();
  return c.includes("étudiant") || c.includes("etudiant") || c === "student";
}

function rangesForNow(now: Date) {
  const monday = startOfWeek(now);
  const nextMonday = addDays(monday, 7);
  const weekR = weekRange(monday);
  const nextWeekR = weekRange(nextMonday);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);

  return {
    weekStart: weekR.start,
    weekEnd: weekR.end,
    nextWeekStart: nextWeekR.start,
    nextWeekEnd: nextWeekR.end,
    monthStart: toISODate(monthStart),
    monthEnd: toISODate(monthEnd),
    yearStart: toISODate(yearStart),
    yearEnd: toISODate(yearEnd),
  };
}

function sumHoursInRange(
  rows: ShiftRow[],
  empId: string,
  startISO: string,
  endISO: string,
): number {
  let total = 0;
  for (const s of rows) {
    if (s.employee_id !== empId) continue;
    if (s.date < startISO || s.date > endISO) continue;
    total += shiftHours(s.start_time, s.end_time, s.break_minutes ?? 0);
  }
  return total;
}

export async function loadQuotaForEmployee(employeeId: string): Promise<QuotaSnapshot> {
  const supabase = await createClient();
  const now = new Date();
  const r = rangesForNow(now);

  const { data: emp } = await supabase
    .from("employees")
    .select("weekly_hours, contract_type, annual_hours_budget")
    .eq("id", employeeId)
    .maybeSingle();
  const e = emp as unknown as {
    weekly_hours: number | null;
    contract_type: string | null;
    annual_hours_budget: number | null;
  } | null;

  const weekly = e?.weekly_hours ?? 38;
  const yearTarget = isStudent(e?.contract_type) ? e?.annual_hours_budget ?? null : null;

  const { data: shiftsRaw } = await supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time, break_minutes")
    .eq("employee_id", employeeId)
    .gte("date", r.yearStart)
    .lte("date", r.yearEnd);
  const rows = (shiftsRaw ?? []) as ShiftRow[];

  const weekHours = sumHoursInRange(rows, employeeId, r.weekStart, r.weekEnd);
  const monthHours = sumHoursInRange(rows, employeeId, r.monthStart, r.monthEnd);
  const yearHours = sumHoursInRange(rows, employeeId, r.yearStart, r.yearEnd);
  const nextWeekHours = sumHoursInRange(rows, employeeId, r.nextWeekStart, r.nextWeekEnd);

  return {
    weekHours,
    weekTarget: weekly,
    monthHours,
    monthTarget: weekly * MONTH_RATIO,
    yearHours,
    yearTarget,
    nextWeekHours,
  };
}

export async function loadQuotasForAllActive(): Promise<EmployeeQuotaRow[]> {
  const supabase = await createClient();
  const now = new Date();
  const r = rangesForNow(now);

  const { data: empsRaw } = await supabase
    .from("employees")
    .select("id, full_name, contract_type, weekly_hours, annual_hours_budget")
    .eq("status", "active")
    .order("full_name");
  const emps = (empsRaw ?? []) as Array<{
    id: string;
    full_name: string;
    contract_type: string | null;
    weekly_hours: number | null;
    annual_hours_budget: number | null;
  }>;

  if (emps.length === 0) return [];

  // Une seule requête : tous les shifts de l'année courante + semaine N+1.
  const { data: shiftsRaw } = await supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time, break_minutes")
    .gte("date", r.yearStart)
    .lte("date", r.nextWeekEnd > r.yearEnd ? r.nextWeekEnd : r.yearEnd);
  const rows = (shiftsRaw ?? []) as ShiftRow[];

  return emps.map((e) => {
    const weekly = e.weekly_hours ?? 38;
    const yearTarget = isStudent(e.contract_type) ? e.annual_hours_budget ?? null : null;
    const weekHours = sumHoursInRange(rows, e.id, r.weekStart, r.weekEnd);
    const monthHours = sumHoursInRange(rows, e.id, r.monthStart, r.monthEnd);
    const yearHours = sumHoursInRange(rows, e.id, r.yearStart, r.yearEnd);
    const nextWeekHours = sumHoursInRange(rows, e.id, r.nextWeekStart, r.nextWeekEnd);
    return {
      employee: e,
      quota: {
        weekHours,
        weekTarget: weekly,
        monthHours,
        monthTarget: weekly * MONTH_RATIO,
        yearHours,
        yearTarget,
        nextWeekHours,
      },
    };
  });
}

/** Tone from progress (0..1+). */
export function quotaTone(progress: number): "ok" | "warn" | "over" {
  if (progress > 1.0001) return "over";
  if (progress >= 0.9) return "warn";
  return "ok";
}

/** Count active employees over their weekly target. */
export async function countWeekOverages(): Promise<number> {
  const all = await loadQuotasForAllActive();
  return all.filter((r) => r.quota.weekHours > r.quota.weekTarget).length;
}
