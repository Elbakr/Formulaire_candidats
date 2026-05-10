// Pure functions to compute weekly coverage per site (department).
//
// Inputs :
//   - employees [{ id, department_id, weekly_hours, status }]
//   - departments [{ id, name }]
//   - shifts [{ employee_id, date, start_time, end_time, break_minutes }]
//   - week range [startISO..endISO]
//
// Outputs : per-site planned hours, target hours, coverage %, status colour.

import { shiftHours } from "@/lib/planning";

export type EmployeeRow = {
  id: string;
  department_id: string | null;
  weekly_hours: number | null;
  status: string;
};

export type DepartmentRow = { id: string; name: string };

export type ShiftRow = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
};

export type SiteCoverage = {
  department_id: string | null;
  name: string;
  active_employees: number;
  target_hours: number;
  planned_hours: number;
  coverage_pct: number;
  /** colour band: "danger" <60, "warn" 60-80, "ok" 80-110, "over" >110 */
  band: "danger" | "warn" | "ok" | "over";
};

export function bandFor(pct: number): SiteCoverage["band"] {
  if (pct < 60) return "danger";
  if (pct < 80) return "warn";
  if (pct <= 110) return "ok";
  return "over";
}

export function bandColor(b: SiteCoverage["band"]): string {
  switch (b) {
    case "danger": return "bg-danger";
    case "warn": return "bg-warn";
    case "ok": return "bg-success";
    case "over": return "bg-gold";
  }
}

export function bandLabel(b: SiteCoverage["band"]): string {
  switch (b) {
    case "danger": return "Sous-staffé";
    case "warn": return "Limite";
    case "ok": return "OK";
    case "over": return "Sur-staffé";
  }
}

export function computeCoverage(
  departments: DepartmentRow[],
  employees: EmployeeRow[],
  shifts: ShiftRow[],
): SiteCoverage[] {
  const empById = new Map<string, EmployeeRow>();
  for (const e of employees) {
    if (e.status === "active") empById.set(e.id, e);
  }

  // Aggregate planned hours per dept (via the employee's department_id)
  const planned = new Map<string, number>();
  for (const s of shifts) {
    const e = empById.get(s.employee_id);
    if (!e) continue;
    const dept = e.department_id ?? "__none__";
    const hours = shiftHours(s.start_time, s.end_time, s.break_minutes ?? 0);
    planned.set(dept, (planned.get(dept) ?? 0) + hours);
  }

  // Aggregate target hours + active count per dept
  const target = new Map<string, number>();
  const count = new Map<string, number>();
  for (const e of empById.values()) {
    const dept = e.department_id ?? "__none__";
    target.set(dept, (target.get(dept) ?? 0) + (e.weekly_hours ?? 0));
    count.set(dept, (count.get(dept) ?? 0) + 1);
  }

  // Build rows : every department, plus an "unassigned" bucket if needed.
  const rows: SiteCoverage[] = [];
  for (const d of departments) {
    const t = target.get(d.id) ?? 0;
    const p = planned.get(d.id) ?? 0;
    const pct = t === 0 ? 0 : (p / t) * 100;
    rows.push({
      department_id: d.id,
      name: d.name,
      active_employees: count.get(d.id) ?? 0,
      target_hours: t,
      planned_hours: p,
      coverage_pct: pct,
      band: bandFor(pct),
    });
  }

  // Unassigned bucket
  const ut = target.get("__none__") ?? 0;
  const up = planned.get("__none__") ?? 0;
  if (ut > 0 || up > 0 || (count.get("__none__") ?? 0) > 0) {
    const pct = ut === 0 ? 0 : (up / ut) * 100;
    rows.push({
      department_id: null,
      name: "Sans service",
      active_employees: count.get("__none__") ?? 0,
      target_hours: ut,
      planned_hours: up,
      coverage_pct: pct,
      band: bandFor(pct),
    });
  }

  // Sort: lowest coverage first (most actionable)
  rows.sort((a, b) => a.coverage_pct - b.coverage_pct);
  return rows;
}

/** Sum of actual hours worked, given shifts ending in the past. */
export function sumHours(shifts: ShiftRow[]): number {
  return shifts.reduce(
    (acc, s) => acc + shiftHours(s.start_time, s.end_time, s.break_minutes ?? 0),
    0,
  );
}
