// Algorithme de génération automatique de planning hebdomadaire.
// Adapté de l'ancien planning-employes.html.

import { addDays, parseISODate, toISODate } from "@/lib/planning";

export type EmployeeForPlan = {
  id: string;
  full_name: string;
  weekly_hours: number;
  status: string;
  department_id: string | null;
  fixed_off_days: number[]; // 0=Lun, 1=Mar, ..., 6=Dim
  default_start_time: string; // "HH:MM:SS" or "HH:MM"
  default_pause_minutes: number;
  default_shift_hours: number;
  wd_mode: string; // 'auto' | '2'..'6'
  week_cycle: number;
  week_phase: number;
};

export type ExistingShift = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
};

export type ApprovedTimeOff = {
  employee_id: string;
  start_date: string;
  end_date: string;
};

export type ShiftDraft = {
  employee_id: string;
  employee_name: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  hours: number;
  reason?: string; // optional explanation if useful
};

export type GenerationResult = {
  drafts: ShiftDraft[];
  uncovered: Array<{ employee_id: string; full_name: string; missing_hours: number }>;
};

function hhmm(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10) || 0);
  return { h, m };
}

function addHoursToTime(start: string, hours: number, breakMin: number): string {
  const { h, m } = hhmm(start);
  const totalMin = h * 60 + m + Math.round(hours * 60) + breakMin;
  const eh = Math.floor(totalMin / 60) % 24;
  const em = totalMin % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

function targetDaysFor(emp: EmployeeForPlan): number {
  if (emp.wd_mode && emp.wd_mode !== "auto") {
    const n = parseInt(emp.wd_mode, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 7) return n;
  }
  // auto: deduct from weekly_hours / default_shift_hours (rounded)
  const n = Math.round(emp.weekly_hours / Math.max(1, emp.default_shift_hours));
  return Math.max(1, Math.min(6, n));
}

function shouldWorkThisWeek(emp: EmployeeForPlan, isoMonday: string): boolean {
  if (emp.week_cycle <= 1) return true;
  // Compute week index since 2020-01-06 (a Monday)
  const epoch = parseISODate("2020-01-06").getTime();
  const wk = Math.floor((parseISODate(isoMonday).getTime() - epoch) / (7 * 86_400_000));
  return wk % emp.week_cycle === emp.week_phase;
}

export function generateWeekPlan(
  monday: Date,
  employees: EmployeeForPlan[],
  existing: ExistingShift[],
  approvedOff: ApprovedTimeOff[],
  options: { defaultPosition?: string } = {},
): GenerationResult {
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekDaysISO = weekDays.map((d) => toISODate(d));
  const isoMonday = weekDaysISO[0];

  const drafts: ShiftDraft[] = [];
  const uncovered: Array<{ employee_id: string; full_name: string; missing_hours: number }> = [];

  for (const emp of employees) {
    if (emp.status !== "active") continue;
    if (!shouldWorkThisWeek(emp, isoMonday)) continue;

    const targetDays = targetDaysFor(emp);
    const shiftHours = emp.default_shift_hours || 8;
    const startTime = (emp.default_start_time || "10:00:00").slice(0, 5);
    const breakMin = emp.default_pause_minutes ?? 30;

    // Determine eligible days (not fixed off, not on time-off, no existing shift)
    const fixedOff = new Set(emp.fixed_off_days || []);
    const offRanges = approvedOff.filter((t) => t.employee_id === emp.id);
    const isOnLeave = (dateISO: string) =>
      offRanges.some((t) => dateISO >= t.start_date && dateISO <= t.end_date);
    const hasExistingShift = (dateISO: string) =>
      existing.some((s) => s.employee_id === emp.id && s.date === dateISO);

    const eligibleDays: { dateISO: string; dayIdx: number }[] = [];
    for (let i = 0; i < 7; i++) {
      if (fixedOff.has(i)) continue;
      const dateISO = weekDaysISO[i];
      if (isOnLeave(dateISO)) continue;
      if (hasExistingShift(dateISO)) continue;
      eligibleDays.push({ dateISO, dayIdx: i });
    }

    // Skip if no slots
    if (eligibleDays.length === 0) {
      uncovered.push({ employee_id: emp.id, full_name: emp.full_name, missing_hours: emp.weekly_hours });
      continue;
    }

    // Take the first `targetDays` eligible days (Mon → Sun preference)
    const chosen = eligibleDays.slice(0, targetDays);
    const totalAssigned = chosen.length * shiftHours;
    const missing = Math.max(0, emp.weekly_hours - totalAssigned);

    for (const { dateISO } of chosen) {
      drafts.push({
        employee_id: emp.id,
        employee_name: emp.full_name,
        date: dateISO,
        start_time: startTime,
        end_time: addHoursToTime(startTime, shiftHours, breakMin),
        break_minutes: breakMin,
        position: options.defaultPosition ?? null,
        location: null,
        hours: shiftHours,
      });
    }

    if (missing > 0) {
      uncovered.push({ employee_id: emp.id, full_name: emp.full_name, missing_hours: missing });
    }
  }

  return { drafts, uncovered };
}
