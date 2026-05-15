"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { startOfWeek, parseISODate, addDays, toISODate, weekRange } from "@/lib/planning";
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

  const result = generateWeekPlan(
    monday,
    employees,
    (shifts ?? []) as unknown as ExistingShift[],
    (timeOff ?? []) as unknown as ApprovedTimeOff[],
    { prayerPause, blockedDates, closures: closuresList },
  );

  return { ...result, weekStart: start, weekEnd: end };
}

export async function commitDraftsAction(drafts: ShiftDraft[]): Promise<{ ok?: boolean; error?: string; created?: number; warnings?: string[] }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  if (!Array.isArray(drafts) || drafts.length === 0) return { error: "Aucun shift à créer." };
  const supabase = await createClient();

  // Karim 15/05/2026 : bug observe -- cette action legacy n inserait PAS
  // site_id, donc les shifts produits par "Generer la semaine" sur le calendar
  // se retrouvaient orphelins (visibles dans le calendar mais absents de
  // la Vue d ensemble qui filtre par site). Fix : lookup du site primaire
  // de chaque employe et hydratation automatique.
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
    if (!siteByEmp.has(a.employee_id)) {
      siteByEmp.set(a.employee_id, a.site_id);
    }
  }

  const warnings: string[] = [];
  const employeesWithoutSite = new Set<string>();
  const rows = drafts.map((d) => {
    const siteId = siteByEmp.get(d.employee_id) ?? null;
    if (!siteId) employeesWithoutSite.add(d.employee_name);
    return {
      employee_id: d.employee_id,
      date: d.date,
      start_time: d.start_time,
      end_time: d.end_time,
      break_minutes: d.break_minutes,
      position: d.position,
      location: d.location,
      site_id: siteId,
      status: "planned" as const,
      created_by: profile.id,
    };
  });
  if (employeesWithoutSite.size > 0) {
    warnings.push(
      `${employeesWithoutSite.size} employé(s) sans site assigné -- leurs shifts sont créés sans site_id et n apparaitront pas sur la Vue d ensemble : ${[...employeesWithoutSite].slice(0, 5).join(", ")}${employeesWithoutSite.size > 5 ? "…" : ""}`,
    );
  }

  const { error } = await supabase.from("shifts").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, created: rows.length, warnings: warnings.length > 0 ? warnings : undefined };
}
