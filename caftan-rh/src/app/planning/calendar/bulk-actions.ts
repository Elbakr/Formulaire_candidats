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

/** Snapshot d un shift supprime, suffisant pour le re-inserer en undo. */
export type DeletedShiftSnapshot = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  location: string | null;
  site_id: string | null;
  notes: string | null;
  is_overtime: boolean;
  overtime_multiplier: number | null;
  status: string;
};

export async function clearWeekAction({
  weekISO,
  siteId,
  employeeId,
}: {
  weekISO: string;
  siteId?: string | null;
  /** Karim 15/05 : permet de vider la semaine d un seul employe (depuis la
   * fiche /planning/employees/[id]/calendar par exemple). */
  employeeId?: string | null;
}): Promise<{ ok?: boolean; error?: string; deleted?: number; snapshots?: DeletedShiftSnapshot[] }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const monday = parseISODate(weekISO);
  const r = weekRange(monday);

  // Karim 15/05 v2 : on SELECT les shifts avant DELETE pour pouvoir les
  // restaurer via undo (Ctrl+Z). Snapshot complet hors id (le re-insert
  // generera de nouveaux ids). 200 shifts max pour eviter les
  // restaurations massives accidentelles.
  let selectQuery = supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time, break_minutes, position, location, site_id, notes, is_overtime, overtime_multiplier, status")
    .gte("date", r.start)
    .lte("date", r.end);
  if (siteId) selectQuery = selectQuery.eq("site_id", siteId);
  if (employeeId) selectQuery = selectQuery.eq("employee_id", employeeId);
  const { data: snapshotsRaw, error: selErr } = await selectQuery;
  if (selErr) return { error: selErr.message };
  const snapshots = (snapshotsRaw ?? []) as DeletedShiftSnapshot[];

  let query = supabase
    .from("shifts")
    .delete({ count: "exact" })
    .gte("date", r.start)
    .lte("date", r.end);
  if (siteId) query = query.eq("site_id", siteId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { error, count } = await query;
  if (error) return { error: error.message };

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, deleted: count ?? 0, snapshots: snapshots.length <= 200 ? snapshots : [] };
}

/**
 * Restaure des shifts a partir d un snapshot (utilise par Ctrl+Z apres
 * clearWeekAction). Les ids ne sont pas preserves -- de nouveaux ids
 * sont generes. Pas de check anti-double-booking (on suppose que rien
 * d autre n a ete cree entre temps, ce qui est le cas normal pour un undo).
 */
export async function restoreDeletedShiftsAction(
  snapshots: DeletedShiftSnapshot[],
): Promise<{ ok?: boolean; error?: string; restored?: number }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  if (snapshots.length === 0) return { ok: true, restored: 0 };
  const supabase = await createClient();
  const rows = snapshots.map((s) => ({
    employee_id: s.employee_id,
    date: s.date,
    start_time: s.start_time,
    end_time: s.end_time,
    break_minutes: s.break_minutes,
    position: s.position,
    location: s.location,
    site_id: s.site_id,
    notes: s.notes,
    is_overtime: s.is_overtime,
    overtime_multiplier: s.overtime_multiplier,
    status: s.status ?? "planned",
    created_by: profile.id,
  }));
  const { error } = await supabase.from("shifts").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, restored: rows.length };
}

/**
 * Karim 15/05 : reinit tous les shifts d une PERIODE arbitraire (par ex.
 * une vue Quotas 4 sem). Optionnel : scope par sites[] ou employe.
 * Retourne snapshots pour undo Ctrl+Z (max 500 shifts).
 */
export async function clearShiftsInPeriodAction({
  startISO,
  endISO,
  siteIds,
  employeeId,
}: {
  startISO: string;
  endISO: string;
  siteIds?: string[] | null;
  employeeId?: string | null;
}): Promise<{ ok?: boolean; error?: string; deleted?: number; snapshots?: DeletedShiftSnapshot[] }> {
  await requireRole(["admin", "rh", "manager"]);
  if (!startISO || !endISO) return { error: "Periode requise." };
  const supabase = await createClient();

  let selQ = supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time, break_minutes, position, location, site_id, notes, is_overtime, overtime_multiplier, status")
    .gte("date", startISO)
    .lte("date", endISO);
  if (siteIds && siteIds.length > 0) selQ = selQ.in("site_id", siteIds);
  if (employeeId) selQ = selQ.eq("employee_id", employeeId);
  const { data: snapsRaw, error: selErr } = await selQ;
  if (selErr) return { error: selErr.message };
  const snapshots = (snapsRaw ?? []) as DeletedShiftSnapshot[];

  let delQ = supabase
    .from("shifts")
    .delete({ count: "exact" })
    .gte("date", startISO)
    .lte("date", endISO);
  if (siteIds && siteIds.length > 0) delQ = delQ.in("site_id", siteIds);
  if (employeeId) delQ = delQ.eq("employee_id", employeeId);
  const { error, count } = await delQ;
  if (error) return { error: error.message };

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return {
    ok: true,
    deleted: count ?? 0,
    snapshots: snapshots.length <= 500 ? snapshots : [],
  };
}

/**
 * Vide TOUT (a partir de demain, regle J+1). Optionnellement scope par site
 * ou par employe. Pour les cas "je recommence a zero" -- gros impact, demande
 * confirmation forte cote UI.
 */
export async function clearAllFutureShiftsAction({
  siteId,
  employeeId,
}: {
  siteId?: string | null;
  employeeId?: string | null;
} = {}) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const tomorrowISO = toISODate(addDays(new Date(), 1));

  let query = supabase
    .from("shifts")
    .delete({ count: "exact" })
    .gte("date", tomorrowISO);
  if (siteId) query = query.eq("site_id", siteId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { error, count } = await query;
  if (error) return { error: error.message };

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, deleted: count ?? 0 };
}

/**
 * Karim 18/05 : action unifiee "Vider tous les planning" avec 3 modes :
 *   - after_today  : shifts strictement APRES aujourd hui (regle J+1)
 *   - until_today  : shifts jusqu a aujourd hui INCLUS
 *   - all          : TOUT (avant + apres + aujourd hui)
 * Scope optionnel : siteId ou employeeId pour limiter.
 */
export async function clearShiftsByModeAction({
  mode,
  siteId,
  employeeId,
}: {
  mode: "after_today" | "until_today" | "all";
  siteId?: string | null;
  employeeId?: string | null;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const todayISO = toISODate(new Date());
  const tomorrowISO = toISODate(addDays(new Date(), 1));

  // Karim 19/05 : log explicite pour audit cote serveur.
  console.log(`[clearShiftsByMode] mode=${mode} siteId=${siteId ?? "(none)"} employeeId=${employeeId ?? "(none)"} today=${todayISO} tomorrow=${tomorrowISO}`);

  // 1. D abord COUNT pour savoir ce qui matchera (transparence + log)
  let countQ = supabase.from("shifts").select("id", { count: "exact", head: true });
  if (mode === "after_today") countQ = countQ.gte("date", tomorrowISO);
  else if (mode === "until_today") countQ = countQ.lte("date", todayISO);
  if (siteId) countQ = countQ.eq("site_id", siteId);
  if (employeeId) countQ = countQ.eq("employee_id", employeeId);
  const { count: matched, error: cntErr } = await countQ;
  if (cntErr) {
    console.error(`[clearShiftsByMode] count error:`, cntErr.message);
    return { error: cntErr.message };
  }
  console.log(`[clearShiftsByMode] ${matched} rows matchees pour le criteria.`);

  // 2. DELETE
  // Karim 19/05 : Supabase / PG bloque le DELETE sans WHERE pour securite
  // ('DELETE requires a WHERE clause'). Pour le mode 'all' sans scope, on
  // ajoute explicitement un WHERE qui matche tout (date depuis 1900).
  let query = supabase.from("shifts").delete({ count: "exact" });
  if (mode === "after_today") {
    query = query.gte("date", tomorrowISO);
  } else if (mode === "until_today") {
    query = query.lte("date", todayISO);
  } else {
    // mode === "all" : pas de filtre date, mais on doit AVOIR un WHERE.
    // 'date >= 1900-01-01' matche toutes les rows existantes en pratique.
    query = query.gte("date", "1900-01-01");
  }
  if (siteId) query = query.eq("site_id", siteId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { error, count } = await query;
  if (error) {
    console.error(`[clearShiftsByMode] delete error:`, error.message);
    return { error: error.message };
  }
  console.log(`[clearShiftsByMode] ${count} rows supprimees.`);

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return {
    ok: true,
    deleted: count ?? 0,
    matched: matched ?? 0,
    mode,
    scope: siteId ? "site" : employeeId ? "employee" : "global",
  };
}

/**
 * Compte les shifts existants pour la semaine. Si `siteId` est fourni, ne
 * compte que les shifts liés à ce site. Permet à l'UI de désactiver le bouton
 * "Vider la semaine" quand il n'y a rien à vider.
 */
export async function countWeekShiftsAction({
  weekISO,
  siteId,
  employeeId,
}: {
  weekISO: string;
  siteId?: string | null;
  employeeId?: string | null;
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
  if (siteId) query = query.eq("site_id", siteId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { count, error } = await query;
  if (error) return { error: error.message };
  return { ok: true, count: count ?? 0 };
}

/** Compteur pour clearAllFutureShiftsAction (= shifts a venir a partir de J+1). */
export async function countFutureShiftsAction({
  siteId,
  employeeId,
}: {
  siteId?: string | null;
  employeeId?: string | null;
} = {}) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const tomorrowISO = toISODate(addDays(new Date(), 1));
  let query = supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .gte("date", tomorrowISO);
  if (siteId) query = query.eq("site_id", siteId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { count, error } = await query;
  if (error) return { error: error.message };
  return { ok: true, count: count ?? 0 };
}
