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

  const [{ data: empRaw }, { data: shiftsRaw }, { data: needsRaw }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, weekly_hours, default_pause_minutes")
      .eq("id", args.employeeId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, employee_id, date, start_time, end_time, break_minutes, is_overtime, site_id")
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("start_time"),
    // Karim 20/05 : besoins pour calculer fermeture site par jour
    supabase
      .from("site_needs")
      .select("site_id, day_of_week, end_time, is_enabled")
      .eq("is_enabled", true),
  ]);
  const emp = empRaw as { id: string; full_name: string; weekly_hours: number | null; default_pause_minutes: number | null } | null;
  if (!emp) return { error: "Employé introuvable" };
  const target = emp.weekly_hours ?? 38;
  const needs = (needsRaw ?? []) as Array<{ site_id: string; day_of_week: number; end_time: string; is_enabled: boolean }>;
  function siteClose(siteId: string | null, jsDow: number): number {
    if (!siteId) return 24 * 60 - 1;
    let m = 0;
    for (const n of needs) {
      if (n.site_id === siteId && n.day_of_week === jsDow) {
        const e = timeToMin(n.end_time.slice(0, 5));
        if (e > m) m = e;
      }
    }
    return m > 0 ? m : 24 * 60 - 1;
  }

  type ShiftRow = { id: string; employee_id: string; date: string; start_time: string; end_time: string; break_minutes: number; is_overtime: boolean | null; site_id: string | null };
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
    // Karim 20/05 : plafond = MIN(fermeture site, prochain shift -15min, 23h59).
    const shiftDow = new Date(sh.date + "T00:00:00").getDay();
    const closeAtSite = siteClose(sh.site_id, shiftDow);
    const ceil = Math.min(
      closeAtSite,
      sameDayLater != null ? sameDayLater - 15 : 23 * 60 + 59,
    );
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
  /** Karim 20/05 : si TRUE, place UNIQUEMENT sur les creneaux rush
   *  (samedi/dimanche/feries + heure 12h-18h). 2eme clic = false pour
   *  combler le reste. */
  rushOnly?: boolean;
}): Promise<{
  ok?: boolean;
  error?: string;
  created?: number;
  minutes_added?: number;
  remaining_min?: number;
  rush_placed?: number;
  non_rush_placed?: number;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const monday = startOfWeek(parseISODate(args.weekISO));
  const { start, end } = weekRange(monday);
  const tomorrowISO = toISODate(addDays(new Date(), 1));
  const minPause = args.minPauseMinutes ?? 15;
  const maxShiftMin = (args.maxShiftHours ?? 4) * 60;

  const [
    { data: empRaw },
    { data: shiftsRaw },
    { data: assignsRaw },
    { data: unavailRaw },
    { data: leavesRaw },
    { data: holidaysRaw },
    { data: needsRawMini },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, weekly_hours, default_start_time, default_pause_minutes, fixed_off_days, force_full_quota")
      .eq("id", args.employeeId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, employee_id, date, start_time, end_time, break_minutes, is_overtime, site_id")
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("site_assignments")
      .select("site_id, is_primary")
      .eq("employee_id", args.employeeId)
      .order("is_primary", { ascending: false })
      .limit(1),
    // Karim 20/05 : indispos recurrentes + ponctuelles (respect des règles)
    supabase
      .from("employee_unavailabilities")
      .select("day_of_week, date_specific, start_time, end_time, is_active")
      .eq("employee_id", args.employeeId)
      .eq("is_active", true),
    supabase
      .from("time_off_requests")
      .select("start_date, end_date")
      .eq("employee_id", args.employeeId)
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start),
    // Karim 20/05 : feries pour le tri rush-first
    supabase
      .from("holidays")
      .select("date, priority")
      .eq("is_active", true)
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("site_needs")
      .select("site_id, day_of_week, end_time, is_enabled")
      .eq("is_enabled", true),
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

  // Pour chaque jour de la semaine, calculer rush_score + tente placement.
  const defaultStart = (emp.default_start_time ?? "10:00").slice(0, 5);
  const breakMin = emp.default_pause_minutes ?? 30;
  const forceQuota = !!emp.force_full_quota;
  const offDays = new Set(emp.fixed_off_days ?? []);
  const unavail = (unavailRaw ?? []) as Array<{ day_of_week: number | null; date_specific: string | null; start_time: string | null; end_time: string | null }>;
  const leaves = (leavesRaw ?? []) as Array<{ start_date: string; end_date: string }>;
  const holidays = (holidaysRaw ?? []) as Array<{ date: string; priority: number | null }>;
  const needsForClose = (needsRawMini ?? []) as Array<{ site_id: string; day_of_week: number; end_time: string; is_enabled: boolean }>;

  // Karim 20/05 : "rush" = samedi (jsDow=6) ou dimanche (jsDow=0) ou jour
  // ferie priorite >= 1. On itere d abord les jours rush, puis les autres.
  const dayCandidates = Array.from({ length: 7 }, (_, i) => {
    const dayDate = addDays(monday, i);
    const dateISO = toISODate(dayDate);
    const jsDow = dayDate.getDay();
    const isHoliday = holidays.some((h) => h.date === dateISO && (h.priority ?? 0) >= 1);
    const isWeekend = jsDow === 0 || jsDow === 6;
    const rushScore = (isWeekend ? 2 : 0) + (isHoliday ? 3 : 0);
    return { dateISO, dayDate, jsDow, rushScore, isHoliday, isWeekend };
  });

  // Tri rush DESC, puis date ASC dans chaque groupe
  const sortedDays = args.rushOnly
    ? dayCandidates.filter((d) => d.rushScore > 0).sort((a, b) => b.rushScore - a.rushScore || a.dateISO.localeCompare(b.dateISO))
    : dayCandidates.sort((a, b) => b.rushScore - a.rushScore || a.dateISO.localeCompare(b.dateISO));

  function siteCloseMini(siteId: string | null, jsDow: number): number {
    if (!siteId) return 24 * 60 - 1;
    let m = 0;
    for (const n of needsForClose) {
      if (n.site_id === siteId && n.day_of_week === jsDow) {
        const e = timeToMin(n.end_time.slice(0, 5));
        if (e > m) m = e;
      }
    }
    return m > 0 ? m : 24 * 60 - 1;
  }

  function isUnavailable(jsDow: number, dateISO: string): boolean {
    // Conge approuve = blocking
    if (leaves.some((l) => dateISO >= l.start_date && dateISO <= l.end_date)) return true;
    // Indispo JOURNALIERE recurrente (start_time/end_time NULL = toute la journee)
    if (unavail.some((u) => u.day_of_week === jsDow && u.start_time === null && u.end_time === null)) return true;
    // Indispo ponctuelle journaliere
    if (unavail.some((u) => u.date_specific === dateISO && u.start_time === null && u.end_time === null)) return true;
    return false;
  }

  function partialUnavailRanges(jsDow: number, dateISO: string): Array<{ s: number; e: number }> {
    return unavail
      .filter((u) =>
        u.start_time != null && u.end_time != null &&
        (u.day_of_week === jsDow || u.date_specific === dateISO),
      )
      .map((u) => ({
        s: timeToMin(u.start_time!.slice(0, 5)),
        e: timeToMin(u.end_time!.slice(0, 5)),
      }));
  }

  const created: Array<{ date: string; start: string; end: string; rush: boolean }> = [];
  let minutesAdded = 0;
  let rushPlaced = 0;
  let nonRushPlaced = 0;

  for (const { dateISO, jsDow, rushScore } of sortedDays) {
    if (remainingMin <= 5) break;
    if (dateISO < tomorrowISO) continue;
    const isoDow = jsDow === 0 ? 6 : jsDow - 1;
    if (offDays.has(isoDow) && !forceQuota) continue;
    // Karim 20/05 : respect des indispos / conges
    if (isUnavailable(jsDow, dateISO)) continue;

    // Shifts existants ce jour (de cet employe ou autres)
    const dayShifts = allShifts
      .filter((s) => s.date === dateISO && s.employee_id === args.employeeId)
      .map((s) => ({
        startM: timeToMin(s.start_time.slice(0, 5)),
        endM: timeToMin(s.end_time.slice(0, 5)),
      }))
      .sort((a, b) => a.startM - b.startM);

    // Karim 20/05 : si rush -> on tente de placer en milieu de journee
    // (12h-18h, le pic client) plutot qu apres le dernier shift.
    let candidateStart: number;
    if (rushScore > 0 && dayShifts.length === 0) {
      candidateStart = 12 * 60; // 12:00 par defaut sur creneau rush
    } else if (dayShifts.length === 0) {
      candidateStart = timeToMin(defaultStart);
    } else {
      candidateStart = dayShifts[dayShifts.length - 1].endM + minPause;
    }
    // Plafond fermeture site (vs 23h59 avant)
    const siteEndMin = siteCloseMini(primarySiteId, jsDow);
    const dayEnd = Math.min(siteEndMin, 23 * 60 + 59);
    const maxAvailMin = Math.max(0, dayEnd - candidateStart);
    if (maxAvailMin < 15) continue;

    // Mini-shift : min(remainingMin, maxShiftMin, maxAvailMin)
    const shiftMin = Math.min(remainingMin, maxShiftMin, maxAvailMin);
    if (shiftMin < 15) continue;
    let newStart = candidateStart;
    let newEnd = candidateStart + shiftMin;

    // Karim 20/05 : decale apres indispo partielle si chevauchement
    const partials = partialUnavailRanges(jsDow, dateISO);
    for (const p of partials) {
      if (newEnd > p.s && newStart < p.e) {
        newStart = Math.max(newStart, p.e + 5);
        newEnd = newStart + shiftMin;
        if (newEnd > dayEnd) break;
      }
    }
    if (newEnd > dayEnd) continue;
    // Petit shift = pas de pause repas (shift < 4h)
    const useBreak = shiftMin >= 4 * 60 ? breakMin : 0;
    const finalEnd = newEnd + useBreak;
    if (finalEnd >= dayEnd) continue;

    const rushTag = rushScore > 0 ? " · 🔥 creneau rush (weekend/ferie)" : "";
    const noteText = `Mini-shift comble quota residuel (${(shiftMin/60).toFixed(2)}h) · 15-min pause apres shift existant${rushTag} · plafond fermeture site ${minToHHMM(dayEnd)}`;
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

    const isRush = rushScore > 0;
    created.push({ date: dateISO, start: minToHHMM(newStart), end: minToHHMM(finalEnd), rush: isRush });
    if (isRush) rushPlaced += 1; else nonRushPlaced += 1;
    minutesAdded += shiftMin;
    remainingMin -= shiftMin;
  }

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return {
    ok: true,
    created: created.length,
    minutes_added: minutesAdded,
    remaining_min: Math.max(0, remainingMin),
    rush_placed: rushPlaced,
    non_rush_placed: nonRushPlaced,
  };
}
