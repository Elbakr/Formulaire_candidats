"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { startOfWeek, parseISODate, addDays, toISODate, weekRange, shiftHours } from "@/lib/planning";
import {
  generateWeekPlan,
  DEFAULT_PRAYER_PAUSE,
  type EmployeeForPlan,
  type ExistingShift,
  type ApprovedTimeOff,
  type ShiftDraft,
  type GenerationResult,
  type PrayerPauseSettings,
} from "@/lib/auto-planning";
import { splitShiftForQuota } from "@/lib/split-overtime";

export async function previewWeekAction(weekISO: string): Promise<GenerationResult & { weekStart: string; weekEnd: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const monday = startOfWeek(parseISODate(weekISO));
  const { start, end } = weekRange(monday);

  const [
    { data: emps },
    { data: shifts },
    { data: timeOff },
    { data: settingsRow },
    { data: blockedHols },
    { data: closures },
    { data: unavailRaw },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select(`id, full_name, weekly_hours, status, department_id,
               fixed_off_days, default_start_time, default_pause_minutes, default_shift_hours,
               wd_mode, week_cycle, week_phase`)
      .eq("status", "active"),
    supabase.from("shifts").select("employee_id, date, start_time, end_time").gte("date", start).lte("date", end),
    supabase
      .from("time_off_requests")
      .select("employee_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("org_settings")
      .select("prayer_pause_enabled, prayer_pause_summer, prayer_pause_winter, prayer_pause_dst_start, prayer_pause_dst_end")
      .eq("id", 1)
      .maybeSingle(),
    // Fériés critiques (priority >= 2) : on évite d'auto-générer dessus.
    // Ça englobe légaux belges + Aïd + Mawlid + Ramadan début + journée des
    // femmes (priorisée). L'admin peut toujours forcer un shift à la main.
    supabase
      .from("holidays")
      .select("date")
      .eq("is_active", true)
      .gte("date", start)
      .lte("date", end)
      .gte("priority", 2),
    supabase
      .from("company_closures")
      .select("start_date, end_date, department_id")
      .lte("start_date", end)
      .gte("end_date", start),
    // Karim 15/05 : indispos declarees par les employes (recurrentes ou
    // ponctuelles). Le solver legacy ne les considerait pas -> shifts crees
    // sur des creneaux d indispo. Fix : on charge tout et on le passe au
    // generator qui pousse le start_time si chevauchement.
    supabase
      .from("employee_unavailabilities")
      .select("employee_id, day_of_week, date_specific, start_time, end_time, is_active")
      .eq("is_active", true)
      .or(`date_specific.is.null,and(date_specific.gte.${start},date_specific.lte.${end})`),
  ]);

  const employees = (emps ?? []) as unknown as EmployeeForPlan[];
  const s = settingsRow as unknown as {
    prayer_pause_enabled: boolean | null;
    prayer_pause_summer: string | null;
    prayer_pause_winter: string | null;
    prayer_pause_dst_start: string | null;
    prayer_pause_dst_end: string | null;
  } | null;
  const prayerPause: PrayerPauseSettings = {
    enabled: s?.prayer_pause_enabled ?? DEFAULT_PRAYER_PAUSE.enabled,
    summer: s?.prayer_pause_summer ?? DEFAULT_PRAYER_PAUSE.summer,
    winter: s?.prayer_pause_winter ?? DEFAULT_PRAYER_PAUSE.winter,
    dstStart: s?.prayer_pause_dst_start ?? DEFAULT_PRAYER_PAUSE.dstStart,
    dstEnd: s?.prayer_pause_dst_end ?? DEFAULT_PRAYER_PAUSE.dstEnd,
  };

  const blockedDates = ((blockedHols ?? []) as Array<{ date: string }>).map((h) => h.date);
  const closuresList = ((closures ?? []) as Array<{
    start_date: string;
    end_date: string;
    department_id: string | null;
  }>);

  const unavailabilities = ((unavailRaw ?? []) as Array<{
    employee_id: string;
    day_of_week: number | null;
    date_specific: string | null;
    start_time: string | null;
    end_time: string | null;
  }>).filter(
    (u) =>
      u.day_of_week !== null ||
      (u.date_specific !== null && u.date_specific >= start && u.date_specific <= end),
  );

  const result = generateWeekPlan(
    monday,
    employees,
    (shifts ?? []) as unknown as ExistingShift[],
    (timeOff ?? []) as unknown as ApprovedTimeOff[],
    { prayerPause, blockedDates, closures: closuresList, unavailabilities },
  );

  return { ...result, weekStart: start, weekEnd: end };
}

export async function commitDraftsAction(drafts: ShiftDraft[]): Promise<{ ok?: boolean; error?: string; created?: number; warnings?: string[]; splits?: number }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  if (!Array.isArray(drafts) || drafts.length === 0) return { error: "Aucun shift à créer." };
  const supabase = await createClient();

  // Lookup site primaire par employe (cf fix 36fa688).
  const empIds = [...new Set(drafts.map((d) => d.employee_id))];
  const todayISO = new Date().toISOString().slice(0, 10);
  const { data: assignsRaw } = await supabase
    .from("site_assignments")
    .select("employee_id, site_id, is_primary")
    .in("employee_id", empIds)
    .lte("start_date", todayISO)
    .or(`end_date.is.null,end_date.gte.${todayISO}`)
    .order("is_primary", { ascending: false });
  const siteByEmp = new Map<string, string>();
  for (const a of (assignsRaw ?? []) as Array<{ employee_id: string; site_id: string; is_primary: boolean }>) {
    if (!siteByEmp.has(a.employee_id)) siteByEmp.set(a.employee_id, a.site_id);
  }

  // Karim 15/05 : fractionnement quota -> OT applique aussi ici.
  // Pour chaque (employee, week), calcul des heures contractuelles deja
  // planifiees dans la semaine en base. Puis pour chaque draft, splitShiftForQuota
  // decide : 1 shift regulier / 1 shift OT / 2 shifts (split au seuil).
  // L accumulateur evolue au fil des inserts pour gerer le cas ou plusieurs
  // drafts du meme employe se cumulent dans la meme semaine.
  const weeklyTargetByEmp = new Map<string, number>();
  const empWeekStartByEmp = new Map<string, string>();
  // Pour chaque (empId, weekMondayISO) -> heures contractuelles deja en base
  // (initialise via une requete groupee ci-dessous).
  const weekContractualKey = (empId: string, weekMondayISO: string) =>
    `${empId}|${weekMondayISO}`;
  const accumulator = new Map<string, number>();

  // Recupere weekly_hours pour chaque employe
  const { data: empsRaw } = await supabase
    .from("employees")
    .select("id, weekly_hours")
    .in("id", empIds);
  for (const e of (empsRaw ?? []) as Array<{ id: string; weekly_hours: number | null }>) {
    weeklyTargetByEmp.set(e.id, e.weekly_hours ?? 38);
  }

  // Recupere heures contractuelles deja planifiees pour chaque (emp, semaine
  // distincte impliquee).
  const weeksInBatch = new Set<string>();
  for (const d of drafts) {
    const wkMon = toISODate(startOfWeek(parseISODate(d.date)));
    weeksInBatch.add(wkMon);
    empWeekStartByEmp.set(d.employee_id, wkMon);
  }
  for (const wkMon of weeksInBatch) {
    const wkEnd = toISODate(addDays(parseISODate(wkMon), 6));
    const { data: shiftsRaw } = await supabase
      .from("shifts")
      .select("employee_id, start_time, end_time, break_minutes, is_overtime")
      .in("employee_id", empIds)
      .gte("date", wkMon)
      .lte("date", wkEnd);
    for (const s of (shiftsRaw ?? []) as Array<{
      employee_id: string;
      start_time: string;
      end_time: string;
      break_minutes: number;
      is_overtime: boolean | null;
    }>) {
      if (s.is_overtime) continue;
      const h = shiftHours(s.start_time.slice(0, 5), s.end_time.slice(0, 5), s.break_minutes ?? 0);
      const key = weekContractualKey(s.employee_id, wkMon);
      accumulator.set(key, (accumulator.get(key) ?? 0) + h);
    }
  }

  const warnings: string[] = [];
  const employeesWithoutSite = new Set<string>();
  let splitsCount = 0;
  type Row = {
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    position: string | null;
    location: string | null;
    site_id: string | null;
    is_overtime: boolean;
    overtime_multiplier: number | null;
    status: "planned";
    created_by: string;
  };
  const rows: Row[] = [];

  for (const d of drafts) {
    const siteId = siteByEmp.get(d.employee_id) ?? null;
    if (!siteId) employeesWithoutSite.add(d.employee_name);

    const wkMon = toISODate(startOfWeek(parseISODate(d.date)));
    const target = weeklyTargetByEmp.get(d.employee_id) ?? 38;
    const accKey = weekContractualKey(d.employee_id, wkMon);
    const already = accumulator.get(accKey) ?? 0;

    const split = splitShiftForQuota({
      startTime: d.start_time.slice(0, 5),
      endTime: d.end_time.slice(0, 5),
      breakMinutes: d.break_minutes,
      alreadyContractualHours: already,
      weeklyTargetHours: target,
      otMultiplier: 1.5,
    });
    if (split.totalProductiveHours <= 0) continue;

    if (split.regular) {
      rows.push({
        employee_id: d.employee_id,
        date: d.date,
        start_time: split.regular.start_time + ":00",
        end_time: split.regular.end_time + ":00",
        break_minutes: split.regular.break_minutes,
        position: d.position,
        location: d.location,
        site_id: siteId,
        is_overtime: false,
        overtime_multiplier: null,
        status: "planned",
        created_by: profile.id,
      });
      accumulator.set(accKey, already + split.regularHours);
    }
    if (split.overtime) {
      rows.push({
        employee_id: d.employee_id,
        date: d.date,
        start_time: split.overtime.start_time + ":00",
        end_time: split.overtime.end_time + ":00",
        break_minutes: split.overtime.break_minutes,
        position: d.position,
        location: d.location,
        site_id: siteId,
        is_overtime: true,
        overtime_multiplier: split.overtime.overtime_multiplier ?? 1.5,
        status: "planned",
        created_by: profile.id,
      });
    }
    if (split.regular && split.overtime) splitsCount += 1;
  }

  if (employeesWithoutSite.size > 0) {
    warnings.push(
      `${employeesWithoutSite.size} employé(s) sans site assigné -- leurs shifts sont créés sans site_id et n apparaitront pas sur la Vue d ensemble : ${[...employeesWithoutSite].slice(0, 5).join(", ")}${employeesWithoutSite.size > 5 ? "…" : ""}`,
    );
  }
  if (splitsCount > 0) {
    warnings.push(
      `${splitsCount} shift(s) fractionne(s) automatiquement au seuil du quota hebdo (regulier + heures sup).`,
    );
  }

  if (rows.length === 0) return { error: "Aucun shift a inserer apres fractionnement." };

  const { error } = await supabase.from("shifts").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, created: rows.length, warnings: warnings.length > 0 ? warnings : undefined, splits: splitsCount };
}
