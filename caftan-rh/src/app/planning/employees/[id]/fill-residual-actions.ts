"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { startOfWeek, parseISODate, weekRange, addDays, toISODate } from "@/lib/planning";

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Karim 20/05 : "Lina a 32h sur 38h, le bouton dit 'Rien a faire' mais je
 * veux combler les 6h restantes meme par fragments de 20 minutes".
 *
 * MODE EXTEND : rallonge les shifts contractuels existants de cet employe
 * sur la semaine. Distribue 'remaining' minutes sur les shifts dans l ordre,
 * en s arretant a la prochaine contrainte (autre shift du meme jour ou 23h).
 */
export async function fillExtendExistingShiftsAction(args: {
  employeeId: string;
  weekISO: string;
}): Promise<{
  ok?: boolean;
  error?: string;
  extended?: number;
  minutes_added?: number;
  remaining_min?: number;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const monday = startOfWeek(parseISODate(args.weekISO));
  const { start, end } = weekRange(monday);

  const [{ data: empRaw }, { data: shiftsRaw }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, weekly_hours, default_pause_minutes")
      .eq("id", args.employeeId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, employee_id, date, start_time, end_time, break_minutes, is_overtime")
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("start_time"),
  ]);
  const emp = empRaw as { id: string; full_name: string; weekly_hours: number | null; default_pause_minutes: number | null } | null;
  if (!emp) return { error: "Employé introuvable" };
  const target = emp.weekly_hours ?? 38;

  type ShiftRow = { id: string; employee_id: string; date: string; start_time: string; end_time: string; break_minutes: number; is_overtime: boolean | null };
  const allShifts = (shiftsRaw ?? []) as ShiftRow[];
  const empContract = allShifts
    .filter((s) => s.employee_id === args.employeeId && !s.is_overtime)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  const empOT = allShifts
    .filter((s) => s.employee_id === args.employeeId && s.is_overtime);

  // Heures contractuelles deja saturees
  function netH(s: ShiftRow): number {
    const startM = timeToMin(s.start_time.slice(0, 5));
    const endM = timeToMin(s.end_time.slice(0, 5));
    return Math.max(0, (endM - startM - (s.break_minutes ?? 0)) / 60);
  }
  const usedH = empContract.reduce((acc, s) => acc + netH(s), 0);
  let remainingMin = Math.round(Math.max(0, target - usedH) * 60);
  if (remainingMin <= 0) {
    return { ok: true, extended: 0, minutes_added: 0, remaining_min: 0 };
  }

  // Trouve, pour chaque shift, la marge max d extension end_time -> limite
  // = prochain shift de l employe ce jour OU 23h59.
  let extended = 0;
  let minutesAdded = 0;
  for (const sh of empContract) {
    if (remainingMin <= 0) break;
    const startM = timeToMin(sh.start_time.slice(0, 5));
    const endM = timeToMin(sh.end_time.slice(0, 5));
    // Prochain shift du meme employe meme jour
    const sameDayLater = allShifts
      .filter((x) => x.employee_id === args.employeeId && x.date === sh.date && x.id !== sh.id)
      .map((x) => timeToMin(x.start_time.slice(0, 5)))
      .filter((m) => m > endM)
      .sort((a, b) => a - b)[0];
    // Plafond : 23h59 ou debut du shift suivant -15min pause
    const ceil = Math.min(23 * 60 + 59, sameDayLater != null ? sameDayLater - 15 : 23 * 60 + 59);
    const maxExtend = Math.max(0, ceil - endM);
    if (maxExtend <= 0) continue;
    const addMin = Math.min(maxExtend, remainingMin);
    if (addMin < 5) continue;
    const newEndM = endM + addMin;
    const { error } = await supabase
      .from("shifts")
      .update({ end_time: minToHHMM(newEndM) + ":00" })
      .eq("id", sh.id);
    if (error) return { error: error.message };
    extended += 1;
    minutesAdded += addMin;
    remainingMin -= addMin;
  }

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, extended, minutes_added: minutesAdded, remaining_min: remainingMin };
}

/**
 * MODE CREATE_NEW : cree de nouveaux mini-shifts avec REGLE 15 MIN PAUSE
 * apres les shifts existants du jour. Pour combler les 6h restantes par
 * exemple : si un shift se termine a 18:00, on cree un nouveau a 18:15.
 * Si pas de shift ce jour-la, on cree au default_start_time.
 */
export async function fillCreateMiniShiftsAction(args: {
  employeeId: string;
  weekISO: string;
  minPauseMinutes?: number; // default 15
  maxShiftHours?: number; // default 4
}): Promise<{
  ok?: boolean;
  error?: string;
  created?: number;
  minutes_added?: number;
  remaining_min?: number;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const monday = startOfWeek(parseISODate(args.weekISO));
  const { start, end } = weekRange(monday);
  const tomorrowISO = toISODate(addDays(new Date(), 1));
  const minPause = args.minPauseMinutes ?? 15;
  const maxShiftMin = (args.maxShiftHours ?? 4) * 60;

  const [{ data: empRaw }, { data: shiftsRaw }, { data: assignsRaw }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, weekly_hours, default_start_time, default_pause_minutes, fixed_off_days, force_full_quota")
      .eq("id", args.employeeId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, employee_id, date, start_time, end_time, break_minutes, is_overtime")
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("site_assignments")
      .select("site_id, is_primary")
      .eq("employee_id", args.employeeId)
      .order("is_primary", { ascending: false })
      .limit(1),
  ]);
  const emp = empRaw as {
    id: string; weekly_hours: number | null; default_start_time: string | null;
    default_pause_minutes: number | null; fixed_off_days: number[] | null;
    force_full_quota: boolean | null;
  } | null;
  if (!emp) return { error: "Employé introuvable" };
  const target = emp.weekly_hours ?? 38;
  const primarySiteId = (assignsRaw as Array<{ site_id: string; is_primary: boolean }> | null)?.[0]?.site_id ?? null;
  if (!primarySiteId) return { error: "Aucun site assigné — affecte d abord un site primary." };

  type ShiftRow = { id: string; employee_id: string; date: string; start_time: string; end_time: string; break_minutes: number; is_overtime: boolean | null };
  const allShifts = (shiftsRaw ?? []) as ShiftRow[];
  const empContract = allShifts.filter((s) => s.employee_id === args.employeeId && !s.is_overtime);

  function netH(s: ShiftRow): number {
    const sM = timeToMin(s.start_time.slice(0, 5));
    const eM = timeToMin(s.end_time.slice(0, 5));
    return Math.max(0, (eM - sM - (s.break_minutes ?? 0)) / 60);
  }
  const usedH = empContract.reduce((acc, s) => acc + netH(s), 0);
  let remainingMin = Math.round(Math.max(0, target - usedH) * 60);
  if (remainingMin <= 0) {
    return { ok: true, created: 0, minutes_added: 0, remaining_min: 0 };
  }

  // Pour chaque jour de la semaine (dans l ordre), tente de placer un mini-shift
  const defaultStart = (emp.default_start_time ?? "10:00").slice(0, 5);
  const breakMin = emp.default_pause_minutes ?? 30;
  const forceQuota = !!emp.force_full_quota;
  const offDays = new Set(emp.fixed_off_days ?? []);

  const created: Array<{ date: string; start: string; end: string }> = [];
  let minutesAdded = 0;

  for (let i = 0; i < 7; i++) {
    if (remainingMin <= 5) break;
    const dayDate = addDays(monday, i);
    const dateISO = toISODate(dayDate);
    if (dateISO < tomorrowISO) continue;
    // ISO dow : 0=Lun..6=Dim (employees.fixed_off_days convention)
    const jsDow = dayDate.getDay();
    const isoDow = jsDow === 0 ? 6 : jsDow - 1;
    if (offDays.has(isoDow) && !forceQuota) continue;

    // Shifts existants ce jour (de cet employe ou autres)
    const dayShifts = allShifts
      .filter((s) => s.date === dateISO && s.employee_id === args.employeeId)
      .map((s) => ({
        startM: timeToMin(s.start_time.slice(0, 5)),
        endM: timeToMin(s.end_time.slice(0, 5)),
      }))
      .sort((a, b) => a.startM - b.startM);

    // Plage candidate : apres le dernier shift de l employe (+ minPause)
    // ou au default_start si pas de shift
    let candidateStart: number;
    if (dayShifts.length === 0) {
      candidateStart = timeToMin(defaultStart);
    } else {
      candidateStart = dayShifts[dayShifts.length - 1].endM + minPause;
    }
    const dayEnd = 23 * 60 + 59;
    const maxAvailMin = Math.max(0, dayEnd - candidateStart);
    if (maxAvailMin < 15) continue; // pas la peine pour < 15 min

    // Mini-shift : min(remainingMin, maxShiftMin, maxAvailMin)
    const shiftMin = Math.min(remainingMin, maxShiftMin, maxAvailMin);
    if (shiftMin < 15) continue;
    const newStart = candidateStart;
    const newEnd = candidateStart + shiftMin;
    // Petit shift = pas de pause repas (shift < 4h)
    const useBreak = shiftMin >= 4 * 60 ? breakMin : 0;
    const finalEnd = newEnd + useBreak;
    if (finalEnd >= dayEnd) continue;

    const noteText = `Mini-shift comble quota residuel (${(shiftMin/60).toFixed(2)}h) · 15-min pause apres shift existant`;
    const { error } = await supabase.from("shifts").insert({
      employee_id: args.employeeId,
      date: dateISO,
      start_time: minToHHMM(newStart) + ":00",
      end_time: minToHHMM(finalEnd) + ":00",
      break_minutes: useBreak,
      site_id: primarySiteId,
      is_overtime: false,
      status: "planned",
      generation_note: noteText,
    });
    if (error) return { error: error.message };

    created.push({ date: dateISO, start: minToHHMM(newStart), end: minToHHMM(finalEnd) });
    minutesAdded += shiftMin;
    remainingMin -= shiftMin;
  }

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, created: created.length, minutes_added: minutesAdded, remaining_min: Math.max(0, remainingMin) };
}
