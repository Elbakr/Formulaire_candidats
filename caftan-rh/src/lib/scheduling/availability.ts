// Smart scheduling — disponibilités managers + hints candidat.
//
// findManagerAvailability : calcule les créneaux libres d'un manager entre fromDate et toDate.
//   - Fenêtre 9h-18h en jours ouvrés (Lun-Ven)
//   - Slots de 30 minutes par défaut
//   - Exclut : ses shifts (status != 'cancelled'), congés approuvés, entretiens scheduled
//
// findCandidateAvailabilityHints : extrait un résumé textuel des prefs candidat.

import { createAdminClient } from "@/lib/supabase/server";
import { addDays, toISODate, parseISODate } from "@/lib/planning";

export type FreeSlot = {
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
};

type ShiftRow = {
  date: string;
  start_time: string;
  end_time: string;
  status: string;
};

type TimeOffRow = {
  start_date: string;
  end_date: string;
};

type InterviewRow = {
  scheduled_at: string;
  duration_min: number | null;
};

const WORKDAY_START_MIN = 9 * 60; // 09:00
const WORKDAY_END_MIN = 18 * 60; // 18:00

function timeStrToMinutes(s: string): number {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

function minutesToTimeStr(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function inclusiveDateRange(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const dayMs = 86_400_000;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
    days.push(new Date(t));
  }
  return days;
}

/**
 * Compute free slots for a manager between fromDate and toDate.
 * Returns slots of `slotMinutes` length within 09:00-18:00 on weekdays only,
 * excluding manager shifts, approved time-off, and scheduled interviews.
 *
 * Note: shifts and time_off are owned by employees (linked via profile_id).
 *       The manager profile may not have an employee record — in that case
 *       we only use interviews to block slots.
 */
export async function findManagerAvailability(args: {
  managerProfileId: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  slotMinutes?: number;
}): Promise<FreeSlot[]> {
  const slotMin = args.slotMinutes ?? 30;
  const admin = createAdminClient();

  // 1) Resolve manager → employee record (if any)
  let employeeId: string | null = null;
  try {
    const { data: emp } = await admin
      .from("employees")
      .select("id")
      .eq("profile_id", args.managerProfileId)
      .maybeSingle();
    employeeId = (emp as { id?: string } | null)?.id ?? null;
  } catch {
    employeeId = null;
  }

  const from = parseISODate(args.fromDate);
  const to = parseISODate(args.toDate);

  // 2) Fetch shifts (manager-as-employee)
  let shifts: ShiftRow[] = [];
  if (employeeId) {
    const { data } = await admin
      .from("shifts")
      .select("date, start_time, end_time, status")
      .eq("employee_id", employeeId)
      .gte("date", args.fromDate)
      .lte("date", args.toDate)
      .neq("status", "cancelled");
    shifts = (data ?? []) as ShiftRow[];
  }

  // 3) Fetch approved time-off
  let timeOffs: TimeOffRow[] = [];
  if (employeeId) {
    const { data } = await admin
      .from("time_off_requests")
      .select("start_date, end_date")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .lte("start_date", args.toDate)
      .gte("end_date", args.fromDate);
    timeOffs = (data ?? []) as TimeOffRow[];
  }

  // 4) Fetch interviews where this manager is the interviewer
  // We treat any interview status='scheduled' as a blocking event.
  const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0).toISOString();
  const toIso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59).toISOString();
  const { data: itvData } = await admin
    .from("interviews")
    .select("scheduled_at, duration_min, status, interviewer")
    .eq("status", "scheduled")
    .eq("interviewer", args.managerProfileId)
    .gte("scheduled_at", fromIso)
    .lte("scheduled_at", toIso);
  const interviews = (itvData ?? []) as InterviewRow[];

  // 5) Build busy intervals per day
  type Interval = { start: number; end: number };
  const busyByDay = new Map<string, Interval[]>();

  function addBusy(date: string, start: number, end: number) {
    if (start >= end) return;
    const cur = busyByDay.get(date) ?? [];
    cur.push({ start: Math.max(0, start), end: Math.min(24 * 60, end) });
    busyByDay.set(date, cur);
  }

  for (const s of shifts) {
    addBusy(s.date, timeStrToMinutes(s.start_time), timeStrToMinutes(s.end_time));
  }

  // Time-off blocks the entire day (full 9-18)
  for (const off of timeOffs) {
    const offFrom = parseISODate(off.start_date);
    const offTo = parseISODate(off.end_date);
    for (const d of inclusiveDateRange(offFrom, offTo)) {
      addBusy(toISODate(d), WORKDAY_START_MIN, WORKDAY_END_MIN);
    }
  }

  for (const it of interviews) {
    const dt = new Date(it.scheduled_at);
    const date = toISODate(dt);
    const startMin = dt.getHours() * 60 + dt.getMinutes();
    const dur = it.duration_min ?? 30;
    addBusy(date, startMin, startMin + dur);
  }

  // 6) Compute free slots day by day (weekdays only)
  const slots: FreeSlot[] = [];
  for (const day of inclusiveDateRange(from, to)) {
    if (isWeekend(day)) continue;
    const date = toISODate(day);
    const busy = (busyByDay.get(date) ?? []).slice().sort((a, b) => a.start - b.start);

    // Merge overlapping busy intervals
    const merged: Interval[] = [];
    for (const b of busy) {
      if (merged.length === 0 || b.start > merged[merged.length - 1].end) {
        merged.push({ ...b });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, b.end);
      }
    }

    // Walk through workday in slotMin steps; emit a slot if [t, t+slotMin]
    // does not intersect any busy interval.
    for (let t = WORKDAY_START_MIN; t + slotMin <= WORKDAY_END_MIN; t += slotMin) {
      const slotStart = t;
      const slotEnd = t + slotMin;
      const conflict = merged.some((b) => slotStart < b.end && slotEnd > b.start);
      if (!conflict) {
        slots.push({
          date,
          start_time: minutesToTimeStr(slotStart),
          end_time: minutesToTimeStr(slotEnd),
        });
      }
    }
  }

  return slots;
}

/**
 * Build a short FR summary of a candidate's availability hints :
 * work_time_pref, available_from, planned_unavailability, langs and motivation extract.
 */
export async function findCandidateAvailabilityHints(candidateId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("candidates")
    .select("full_name, work_time_pref, available_from, planned_unavailability, langs, wanted_contract_type")
    .eq("id", candidateId)
    .maybeSingle();

  type Cand = {
    full_name?: string | null;
    work_time_pref?: string | null;
    available_from?: string | null;
    planned_unavailability?: string | null;
    langs?: Record<string, unknown> | null;
    wanted_contract_type?: string | null;
  };
  const c = (data ?? {}) as Cand;

  // Pull last application motivation for context
  const { data: app } = await admin
    .from("applications")
    .select("motivation")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const motivation = ((app as { motivation?: string | null } | null)?.motivation ?? "").trim();

  const langsList = c.langs && typeof c.langs === "object"
    ? Object.entries(c.langs)
        .filter(([, v]) => !!v)
        .map(([k]) => k)
        .join(", ")
    : "";

  const lines: string[] = [];
  if (c.full_name) lines.push(`Nom : ${c.full_name}`);
  if (c.work_time_pref) lines.push(`Préférence horaire : ${c.work_time_pref}`);
  if (c.available_from) lines.push(`Disponible à partir du : ${c.available_from}`);
  if (c.planned_unavailability) lines.push(`Indispos prévues : ${c.planned_unavailability}`);
  if (langsList) lines.push(`Langues : ${langsList}`);
  if (c.wanted_contract_type) lines.push(`Contrat souhaité : ${c.wanted_contract_type}`);
  if (motivation) lines.push(`Motivation : ${motivation.slice(0, 400)}`);

  if (lines.length === 0) return "Aucune information détaillée.";
  return lines.join("\n");
}

/** Helper used by callers : default 14-day window starting tomorrow. */
export function defaultSchedulingWindow(): { from: string; to: string } {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const horizon = addDays(today, 14);
  return { from: toISODate(tomorrow), to: toISODate(horizon) };
}
