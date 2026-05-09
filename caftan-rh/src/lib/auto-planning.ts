// Algorithme de génération automatique de planning hebdomadaire.
// Adapté de l'ancien planning-employes.html.

import { addDays, parseISODate, toISODate } from "@/lib/planning";

// ─── Pause prière vendredi ───────────────────────────────────────────
// Anciennement FRIDAY_PAUSE_WINTER 12:55-13:45 et FRIDAY_PAUSE_SUMMER 13:55-14:45
// avec détection auto été/hiver via dates DST.

export type PrayerPauseSettings = {
  enabled: boolean;
  summer: string; // "HH:MM-HH:MM"
  winter: string; // "HH:MM-HH:MM"
  dstStart: string; // "MM-DD" (entrée en heure d'été)
  dstEnd: string;   // "MM-DD" (sortie d'heure d'été)
};

export const DEFAULT_PRAYER_PAUSE: PrayerPauseSettings = {
  enabled: true,
  summer: "13:55-14:45",
  winter: "12:55-13:45",
  dstStart: "04-01",
  dstEnd: "10-01",
};

function parseRange(s: string): { start: string; end: string } | null {
  const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec((s ?? "").trim());
  if (!m) return null;
  return { start: m[1], end: m[2] };
}

function isSummerDate(date: Date, dstStart: string, dstEnd: string): boolean {
  const md = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  // dstStart inclusive, dstEnd exclusive (e.g. 04-01 → 10-01 means Apr-Sep)
  return md >= dstStart && md < dstEnd;
}

/**
 * Returns the prayer pause window for a given date, or null if not applicable.
 * Only Fridays (getDay() === 5) trigger a pause.
 */
export function prayerPauseFor(
  date: Date,
  settings: PrayerPauseSettings = DEFAULT_PRAYER_PAUSE,
): { start: string; end: string } | null {
  if (!settings?.enabled) return null;
  if (date.getDay() !== 5) return null; // 5 = Friday
  const range = isSummerDate(date, settings.dstStart, settings.dstEnd)
    ? parseRange(settings.summer)
    : parseRange(settings.winter);
  return range;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Check if a shift overlaps with a prayer pause window.
 */
export function shiftOverlapsPause(
  startTime: string,
  endTime: string,
  pause: { start: string; end: string },
): boolean {
  const sS = timeToMinutes(startTime);
  const sE = timeToMinutes(endTime);
  const pS = timeToMinutes(pause.start);
  const pE = timeToMinutes(pause.end);
  return sS < pE && sE > pS;
}

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
  options: { defaultPosition?: string; prayerPause?: PrayerPauseSettings } = {},
): GenerationResult {
  const prayerPause = options.prayerPause ?? DEFAULT_PRAYER_PAUSE;
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
      const endTime = addHoursToTime(startTime, shiftHours, breakMin);

      // Pause prière vendredi : si le shift chevauche, on découpe en 2 segments
      // (matin avant pause + après-midi après pause). Si trop court, on saute.
      const dayDate = parseISODate(dateISO);
      const pause = prayerPauseFor(dayDate, prayerPause);
      if (pause && shiftOverlapsPause(startTime, endTime, pause)) {
        const sS = timeToMinutes(startTime);
        const sE = timeToMinutes(endTime);
        const pS = timeToMinutes(pause.start);
        const pE = timeToMinutes(pause.end);

        const morningEnd = Math.max(sS, Math.min(sE, pS));
        const afternoonStart = Math.min(sE, Math.max(sS, pE));
        const morningHours = (morningEnd - sS) / 60;
        const afternoonHours = (sE - afternoonStart) / 60;
        const minSegment = 1.5; // 1h30 minimum pour qu'un segment ait du sens

        // Segment matin
        if (morningHours >= minSegment) {
          drafts.push({
            employee_id: emp.id,
            employee_name: emp.full_name,
            date: dateISO,
            start_time: startTime,
            end_time: minutesToTime(morningEnd),
            break_minutes: 0,
            position: options.defaultPosition ?? null,
            location: null,
            hours: morningHours,
            reason: "Shift coupé par pause prière vendredi (matin)",
          });
        }
        // Segment après-midi
        if (afternoonHours >= minSegment) {
          drafts.push({
            employee_id: emp.id,
            employee_name: emp.full_name,
            date: dateISO,
            start_time: minutesToTime(afternoonStart),
            end_time: endTime,
            break_minutes: breakMin,
            position: options.defaultPosition ?? null,
            location: null,
            hours: afternoonHours,
            reason: "Shift coupé par pause prière vendredi (après-midi)",
          });
        }
        continue;
      }

      drafts.push({
        employee_id: emp.id,
        employee_name: emp.full_name,
        date: dateISO,
        start_time: startTime,
        end_time: endTime,
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
