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

  const [{ data: emps }, { data: shifts }, { data: timeOff }, { data: settingsRow }] = await Promise.all([
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

  const result = generateWeekPlan(
    monday,
    employees,
    (shifts ?? []) as unknown as ExistingShift[],
    (timeOff ?? []) as unknown as ApprovedTimeOff[],
    { prayerPause },
  );

  return { ...result, weekStart: start, weekEnd: end };
}

export async function commitDraftsAction(drafts: ShiftDraft[]): Promise<{ ok?: boolean; error?: string; created?: number }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  if (!Array.isArray(drafts) || drafts.length === 0) return { error: "Aucun shift à créer." };
  const supabase = await createClient();

  const rows = drafts.map((d) => ({
    employee_id: d.employee_id,
    date: d.date,
    start_time: d.start_time,
    end_time: d.end_time,
    break_minutes: d.break_minutes,
    position: d.position,
    location: d.location,
    status: "planned" as const,
    created_by: profile.id,
  }));

  const { error } = await supabase.from("shifts").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, created: rows.length };
}
