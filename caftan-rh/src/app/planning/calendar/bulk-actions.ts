"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { addDays, parseISODate, toISODate, weekRange } from "@/lib/planning";

type ShiftRow = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  site_id: string | null;
  notes: string | null;
};

async function fetchWeekShifts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  start: string,
  end: string,
): Promise<ShiftRow[]> {
  const { data } = await supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time, break_minutes, position, location, site_id, notes")
    .gte("date", start)
    .lte("date", end);
  return (data ?? []) as ShiftRow[];
}

function shiftDay(dateISO: string, deltaDays: number): string {
  return toISODate(addDays(parseISODate(dateISO), deltaDays));
}

export async function copyWeekFromPreviousAction({
  weekISO,
  force = false,
}: {
  weekISO: string;
  force?: boolean;
}) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const targetMonday = parseISODate(weekISO);
  const prevMonday = addDays(targetMonday, -7);
  const tgt = weekRange(targetMonday);
  const src = weekRange(prevMonday);

  const existing = await fetchWeekShifts(supabase, tgt.start, tgt.end);
  if (existing.length > 0 && !force) {
    return { needsConfirm: true, count: existing.length };
  }
  const sourceShifts = await fetchWeekShifts(supabase, src.start, src.end);
  if (sourceShifts.length === 0) {
    return { error: "Aucun shift à copier (semaine précédente vide)." };
  }

  if (existing.length > 0 && force) {
    const { error: delErr } = await supabase
      .from("shifts")
      .delete()
      .gte("date", tgt.start)
      .lte("date", tgt.end);
    if (delErr) return { error: delErr.message };
  }

  const inserts = sourceShifts.map((s) => ({
    employee_id: s.employee_id,
    date: shiftDay(s.date, 7),
    start_time: s.start_time,
    end_time: s.end_time,
    break_minutes: s.break_minutes,
    position: s.position,
    location: s.location,
    site_id: s.site_id,
    notes: s.notes,
    created_by: profile.id,
  }));
  const { error } = await supabase.from("shifts").insert(inserts);
  if (error) return { error: error.message };

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, copied: inserts.length };
}

export async function copyWeekToNextAction({
  weekISO,
  force = false,
}: {
  weekISO: string;
  force?: boolean;
}) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const sourceMonday = parseISODate(weekISO);
  const nextMonday = addDays(sourceMonday, 7);
  const src = weekRange(sourceMonday);
  const tgt = weekRange(nextMonday);

  const existing = await fetchWeekShifts(supabase, tgt.start, tgt.end);
  if (existing.length > 0 && !force) {
    return { needsConfirm: true, count: existing.length };
  }
  const sourceShifts = await fetchWeekShifts(supabase, src.start, src.end);
  if (sourceShifts.length === 0) {
    return { error: "Aucun shift à copier dans la semaine en cours." };
  }

  if (existing.length > 0 && force) {
    const { error: delErr } = await supabase
      .from("shifts")
      .delete()
      .gte("date", tgt.start)
      .lte("date", tgt.end);
    if (delErr) return { error: delErr.message };
  }

  const inserts = sourceShifts.map((s) => ({
    employee_id: s.employee_id,
    date: shiftDay(s.date, 7),
    start_time: s.start_time,
    end_time: s.end_time,
    break_minutes: s.break_minutes,
    position: s.position,
    location: s.location,
    site_id: s.site_id,
    notes: s.notes,
    created_by: profile.id,
  }));
  const { error } = await supabase.from("shifts").insert(inserts);
  if (error) return { error: error.message };

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, copied: inserts.length };
}

export async function clearWeekAction({
  weekISO,
  siteId,
}: {
  weekISO: string;
  siteId?: string | null;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const monday = parseISODate(weekISO);
  const r = weekRange(monday);

  let query = supabase
    .from("shifts")
    .delete({ count: "exact" })
    .gte("date", r.start)
    .lte("date", r.end);
  if (siteId) {
    query = query.eq("site_id", siteId);
  }
  const { error, count } = await query;
  if (error) return { error: error.message };

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, deleted: count ?? 0 };
}

/**
 * Compte les shifts existants pour la semaine. Si `siteId` est fourni, ne
 * compte que les shifts liés à ce site. Permet à l'UI de désactiver le bouton
 * "Vider la semaine" quand il n'y a rien à vider.
 */
export async function countWeekShiftsAction({
  weekISO,
  siteId,
}: {
  weekISO: string;
  siteId?: string | null;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const monday = parseISODate(weekISO);
  const r = weekRange(monday);

  let query = supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .gte("date", r.start)
    .lte("date", r.end);
  if (siteId) {
    query = query.eq("site_id", siteId);
  }
  const { count, error } = await query;
  if (error) return { error: error.message };
  return { ok: true, count: count ?? 0 };
}
