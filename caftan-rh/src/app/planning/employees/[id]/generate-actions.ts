"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { startOfWeek, addDays, toISODate, parseISODate } from "@/lib/planning";

type EmpRow = {
  id: string;
  full_name: string;
  status: string;
  weekly_hours: number | null;
  fixed_off_days: number[] | null;
  default_pause_minutes: number | null;
  default_start_time: string | null;
  default_shift_hours: number | null;
};

export type EmpPlanDraft = {
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  site_id: string | null;
  is_overtime: false;
  hours: number;
};

/** Karim 15/05 : shift OT existant a reclasser en contractuel pour boucher
 *  le quota inutilise. Le commit fera un UPDATE is_overtime=false. */
export type EmpReclassifyOTToContract = {
  shift_id: string;
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
};

export type EmpPlanPreview = {
  employee_id: string;
  employee_name: string;
  weekly_target: number;
  already_contractual_hours: number;
  available_days: number;
  drafts: EmpPlanDraft[];
  reclassifications: EmpReclassifyOTToContract[];
  total_drafts_hours: number;
  total_reclassified_hours: number;
  warnings: string[];
};

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
 * Genere une proposition de planning hebdo POUR UN EMPLOYE donne, en
 * respectant son quota contractuel (weekly_hours), ses jours OFF fixes, ses
 * indispos declarees, ses conges approuves et les magasins fermes.
 *
 * Logique simple (decision Karim 2026-05-13 :
 *   1. Calcule les jours dispo de la semaine : 7 - off - shops_closed - closures - leaves - indispos journee
 *   2. Determine la duree par shift = default_shift_hours (default 8h), plafonnee a weekly_hours / nb_jours_dispo
 *   3. Distribue les heures sur les jours dispo dans l'ordre lundi -> dimanche
 *   4. N'ECRASE PAS les shifts contractuels existants : les heures deja planifiees sont deduites du quota
 *   5. Site = site primary actif de l'employe (ou null si pas d'assignation)
 *
 * NE FAIT PAS d'OT (is_overtime: false partout). Le user reclasse manuellement
 * via le banner QuotaOverrunBanner si besoin.
 */
export async function generateEmployeeWeekPlanAction(args: {
  employeeId: string;
  weekISO: string;
}): Promise<{ preview?: EmpPlanPreview; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { employeeId, weekISO } = args;
  if (!employeeId || !weekISO) return { error: "Param requis." };

  const monday = startOfWeek(parseISODate(weekISO));
  const sunday = addDays(monday, 6);
  const weekStart = toISODate(monday);
  const weekEnd = toISODate(sunday);
  const todayISO = toISODate(new Date());
  // Regle fondamentale Karim 2026-05-13 : aucune generation sur date passee
  // ou aujourd'hui. On planifie a partir de J+1 (demain) uniquement.
  const tomorrowISO = toISODate(addDays(new Date(), 1));

  const [
    { data: empRaw },
    { data: shiftsRaw },
    { data: leavesRaw },
    { data: unavailRaw },
    { data: holidaysRaw },
    { data: closuresRaw },
    { data: assignsRaw },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, status, weekly_hours, fixed_off_days, default_pause_minutes, default_start_time, default_shift_hours")
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, date, start_time, end_time, break_minutes, is_overtime")
      .eq("employee_id", employeeId)
      .gte("date", weekStart)
      .lte("date", weekEnd),
    supabase
      .from("time_off_requests")
      .select("start_date, end_date")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart),
    supabase
      .from("employee_unavailabilities")
      .select("day_of_week, date_specific, start_time, end_time, is_active")
      .eq("employee_id", employeeId)
      .eq("is_active", true),
    supabase
      .from("holidays")
      .select("date, shops_closed")
      .eq("is_active", true)
      .eq("shops_closed", true)
      .gte("date", weekStart)
      .lte("date", weekEnd),
    supabase
      .from("company_closures")
      .select("start_date, end_date")
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart),
    supabase
      .from("site_assignments")
      .select("site_id, is_primary, start_date, end_date")
      .eq("employee_id", employeeId)
      .lte("start_date", todayISO)
      .or(`end_date.is.null,end_date.gte.${todayISO}`)
      .order("is_primary", { ascending: false }),
  ]);

  const emp = empRaw as EmpRow | null;
  if (!emp) return { error: "Employé introuvable." };
  if (emp.status !== "active") return { error: "Employé non actif." };

  const weeklyTarget = emp.weekly_hours ?? 38;
  const existingShifts = (shiftsRaw ?? []) as Array<{
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    is_overtime: boolean | null;
  }>;
  function shiftDurHours(s: { start_time: string; end_time: string; break_minutes: number }): number {
    return (
      (timeToMin(s.end_time.slice(0, 5)) -
        timeToMin(s.start_time.slice(0, 5)) -
        (s.break_minutes ?? 0)) /
      60
    );
  }

  let alreadyContract = existingShifts
    .filter((s) => !s.is_overtime)
    .reduce((a, s) => a + shiftDurHours(s), 0);

  // Karim 15/05/2026 : si des shifts OT existent ALORS que le quota
  // contractuel n est pas atteint, ils doivent etre RECLASSES en contractuel.
  // Boucler la reserve avant de generer/garder de l OT.
  const existingOT = existingShifts
    .filter((s) => s.is_overtime)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));

  const reclassifications: EmpReclassifyOTToContract[] = [];
  for (const ot of existingOT) {
    const h = shiftDurHours(ot);
    if (h <= 0) continue;
    const remaining = weeklyTarget - alreadyContract;
    if (remaining <= 0.001) break;
    if (h <= remaining + 0.001) {
      // Tout le shift OT tient dans la reserve -> reclasse entier
      reclassifications.push({
        shift_id: ot.id,
        date: ot.date,
        start_time: ot.start_time.slice(0, 5),
        end_time: ot.end_time.slice(0, 5),
        hours: h,
      });
      alreadyContract += h;
    } else {
      // Le shift OT depasse la reserve -- pour l instant on ne fractionne pas
      // un shift OT existant lors d une regeneration (operation risquee qui
      // modifie un horaire valide par l employe). On laisse tel quel.
      // L admin peut splitter manuellement via ShiftDialog si besoin.
      break;
    }
  }

  const dayWithExistingShift = new Set(existingShifts.map((s) => s.date));

  // Days off de l'employe : fixed_off_days (0=Lun..6=Dim)
  const offDays = new Set((emp.fixed_off_days ?? []) as number[]);
  // Date.getDay() : 0=Dim..6=Sam. Convention fixed_off : 0=Lun..6=Dim.
  function dayOffByFixed(jsDow: number): boolean {
    const isoDow = jsDow === 0 ? 6 : jsDow - 1;
    return offDays.has(isoDow);
  }

  const leaves = (leavesRaw ?? []) as Array<{ start_date: string; end_date: string }>;
  function dayInLeave(dateISO: string): boolean {
    return leaves.some((l) => dateISO >= l.start_date && dateISO <= l.end_date);
  }

  const unavail = (unavailRaw ?? []) as Array<{
    day_of_week: number | null;
    date_specific: string | null;
    start_time: string | null;
    end_time: string | null;
    is_active: boolean;
  }>;
  function dayFullyBlockedByUnavail(jsDow: number, dateISO: string): boolean {
    return unavail.some((u) => {
      const matchDay = u.day_of_week === jsDow || u.date_specific === dateISO;
      if (!matchDay) return false;
      // Bornes nulles = journee entiere
      return !u.start_time || !u.end_time;
    });
  }

  const shopsClosedDates = new Set(
    ((holidaysRaw ?? []) as Array<{ date: string }>).map((h) => h.date),
  );
  const closures = (closuresRaw ?? []) as Array<{ start_date: string; end_date: string }>;
  function dayClosed(dateISO: string): boolean {
    if (shopsClosedDates.has(dateISO)) return true;
    return closures.some((c) => dateISO >= c.start_date && dateISO <= c.end_date);
  }

  // Site primaire actif (ou premier secondaire si pas de primaire)
  const assigns = (assignsRaw ?? []) as Array<{
    site_id: string;
    is_primary: boolean;
    start_date: string;
    end_date: string | null;
  }>;
  const primarySiteId = assigns[0]?.site_id ?? null;
  if (!primarySiteId) {
    // Karim 2026-05-13 : refus de generer un shift sans site. Sans site,
    // les shifts sont orphelins (n'apparaissent pas sur /planning/sites/[code]
    // ni dans la couverture par site). L'admin doit d'abord assigner.
    return {
      error: `${emp.full_name} n'a aucun site assigné. Affecte-la·le d'abord à un site depuis le dashboard /admin (carte "Employés sans site"), puis relance la génération.`,
    };
  }

  // Boucle 7 jours : determine quels jours sont dispo
  type DayCandidate = { dateISO: string; jsDow: number };
  const candidates: DayCandidate[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const dateISO = toISODate(d);
    const jsDow = d.getDay();
    // Regle fondamentale Karim : pas de planification < J+1 (passe ou aujourd'hui).
    if (dateISO < tomorrowISO) continue;
    if (dayClosed(dateISO)) continue;
    if (dayOffByFixed(jsDow)) continue;
    if (dayInLeave(dateISO)) continue;
    if (dayFullyBlockedByUnavail(jsDow, dateISO)) continue;
    if (dayWithExistingShift.has(dateISO)) continue; // on respecte les shifts deja la
    candidates.push({ dateISO, jsDow });
  }

  // Helper pour les early-return : on doit propager les reclassifications
  // computees plus haut (sinon le total_reclassified_hours est mort).
  const totalReclassifiedEarly = reclassifications.reduce((a, r) => a + r.hours, 0);
  if (totalReclassifiedEarly > 0) {
    warnings.unshift(
      `${reclassifications.length} shift(s) OT existant(s) reclasse(s) en contractuel (+${totalReclassifiedEarly.toFixed(1)}h).`,
    );
  }

  const remainingTarget = Math.max(0, weeklyTarget - alreadyContract);
  if (remainingTarget <= 0.01) {
    warnings.push(`Le quota contractuel est déjà atteint (${alreadyContract.toFixed(1)}h / ${weeklyTarget}h). Rien à ajouter.`);
    return {
      preview: {
        employee_id: emp.id,
        employee_name: emp.full_name,
        weekly_target: weeklyTarget,
        already_contractual_hours: alreadyContract,
        available_days: candidates.length,
        drafts: [],
        reclassifications,
        total_drafts_hours: 0,
        total_reclassified_hours: totalReclassifiedEarly,
        warnings,
      },
    };
  }
  if (candidates.length === 0) {
    warnings.push("Aucun jour disponible cette semaine (jours OFF / congés / fermetures / shifts déjà présents).");
    return {
      preview: {
        employee_id: emp.id,
        employee_name: emp.full_name,
        weekly_target: weeklyTarget,
        already_contractual_hours: alreadyContract,
        available_days: 0,
        drafts: [],
        reclassifications,
        total_drafts_hours: 0,
        total_reclassified_hours: totalReclassifiedEarly,
        warnings,
      },
    };
  }

  // Durée par shift : default_shift_hours OU plafond fonction du quota / jours
  const defaultShift = emp.default_shift_hours ?? 8;
  const avgPerDay = remainingTarget / candidates.length;
  const shiftHours = Math.min(defaultShift, Math.max(4, Math.ceil(avgPerDay)));

  const startTime = emp.default_start_time ?? "10:00";
  const startMin = timeToMin(startTime.slice(0, 5));
  const breakMin = emp.default_pause_minutes ?? 30;

  // Distribue : on remplit jusqu'a saturation du quota
  const drafts: EmpPlanDraft[] = [];
  let remaining = remainingTarget;
  for (const c of candidates) {
    if (remaining <= 0.01) break;
    const dayHours = Math.min(shiftHours, remaining);
    if (dayHours < 1) break; // pas de mini-shift < 1h
    const endMin = startMin + Math.round(dayHours * 60) + breakMin;
    if (endMin >= 24 * 60) continue; // ne pas deborder
    drafts.push({
      date: c.dateISO,
      start_time: startTime.slice(0, 5) + ":00",
      end_time: minToHHMM(endMin) + ":00",
      break_minutes: breakMin,
      site_id: primarySiteId,
      is_overtime: false,
      hours: dayHours,
    });
    remaining -= dayHours;
  }

  if (remaining > 0.5) {
    warnings.push(
      `Il reste ${remaining.toFixed(1)}h non placées : pas assez de jours dispo ou shift trop court. Ajoute manuellement après validation.`,
    );
  }
  if (!primarySiteId) {
    warnings.push("Aucun site assigné -- les shifts seront créés sans site. Affecte d'abord à un site via /admin.");
  }

  // Note : le warning de reclassement a deja ete ajoute en tete plus haut
  // (totalReclassifiedEarly). On evite le doublon ici.
  const totalReclassified = totalReclassifiedEarly;

  return {
    preview: {
      employee_id: emp.id,
      employee_name: emp.full_name,
      weekly_target: weeklyTarget,
      already_contractual_hours: alreadyContract,
      available_days: candidates.length,
      drafts,
      reclassifications,
      total_drafts_hours: drafts.reduce((a, d) => a + d.hours, 0),
      total_reclassified_hours: totalReclassified,
      warnings,
    },
  };
}

/**
 * Applique les drafts produits par generateEmployeeWeekPlanAction.
 * - INSERT les nouveaux drafts (is_overtime=false)
 * - UPDATE les shifts OT existants a reclasser en contractuel (Karim 15/05)
 *   pour boucher la reserve avant de creer de nouveau de l OT
 */
export async function commitEmployeeWeekPlanAction(args: {
  employeeId: string;
  drafts: EmpPlanDraft[];
  reclassifyShiftIds?: string[];
}): Promise<{ ok?: boolean; error?: string; created?: number; reclassified?: number }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { employeeId, drafts, reclassifyShiftIds = [] } = args;
  if (!employeeId) return { error: "Employee requis." };
  if (drafts.length === 0 && reclassifyShiftIds.length === 0) {
    return { error: "Rien a appliquer (ni nouveau draft, ni reclassement)." };
  }

  // 1. Reclassement OT -> contractuel (avant insert pour eviter doublons cap)
  let reclassified = 0;
  if (reclassifyShiftIds.length > 0) {
    const { error: updErr, count } = await supabase
      .from("shifts")
      .update({ is_overtime: false, overtime_multiplier: null }, { count: "exact" })
      .in("id", reclassifyShiftIds)
      .eq("employee_id", employeeId)
      .eq("is_overtime", true); // garde-fou : on reclasse uniquement de l OT
    if (updErr) return { error: updErr.message };
    reclassified = count ?? 0;
  }

  // 2. Insertion des nouveaux drafts (toujours en contractuel)
  let created = 0;
  if (drafts.length > 0) {
    const rows = drafts.map((d) => ({
      employee_id: employeeId,
      date: d.date,
      start_time: d.start_time,
      end_time: d.end_time,
      break_minutes: d.break_minutes,
      site_id: d.site_id,
      is_overtime: false,
      status: "planned" as const,
      created_by: profile.id,
    }));
    const { error } = await supabase.from("shifts").insert(rows);
    if (error) return { error: error.message };
    created = rows.length;
  }

  revalidatePath("/planning", "layout");
  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true, created, reclassified };
}
