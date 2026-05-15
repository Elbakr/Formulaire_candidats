"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireProfile } from "@/lib/auth";
import {
  evaluateLeaveRequest,
  describeAutoReason,
} from "@/lib/leave-auto-validation";
import { sendPushToProfile } from "@/lib/push-notify";
import { shiftHours, startOfWeek, addDays, toISODate } from "@/lib/planning";
import { splitShiftForQuota } from "@/lib/split-overtime";
import { isRuleEnabled, mergeWithDefaults } from "@/lib/autoplaner-rules";

/**
 * Calcule les heures déjà planifiées (hors OT) pour un employé sur la semaine
 * ISO contenant `dateISO` (Lundi–Dimanche), en EXCLUANT le shift `excludeId`.
 * Renvoie aussi le `weekly_hours` contractuel pour comparaison côté UI.
 */
export async function getEmployeeWeeklyHoursAction(
  employeeId: string,
  dateISO: string,
  excludeShiftId?: string | null,
): Promise<{
  weeklyTarget: number;
  contractualHoursThisWeek: number;
  overtimeHoursThisWeek: number;
  weekStart: string;
  weekEnd: string;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const monday = startOfWeek(new Date(dateISO + "T00:00:00"));
  const sunday = addDays(monday, 6);
  const weekStart = toISODate(monday);
  const weekEnd = toISODate(sunday);

  const [{ data: emp }, { data: shiftsRaw }] = await Promise.all([
    supabase
      .from("employees")
      .select("weekly_hours")
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, start_time, end_time, break_minutes, is_overtime")
      .eq("employee_id", employeeId)
      .gte("date", weekStart)
      .lte("date", weekEnd),
  ]);

  const weeklyTarget =
    (emp as { weekly_hours: number | null } | null)?.weekly_hours ?? 38;
  const shifts = (shiftsRaw ?? []) as Array<{
    id: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    is_overtime: boolean | null;
  }>;

  let contractualHoursThisWeek = 0;
  let overtimeHoursThisWeek = 0;
  for (const s of shifts) {
    if (excludeShiftId && s.id === excludeShiftId) continue;
    const h = shiftHours(
      s.start_time.slice(0, 5),
      s.end_time.slice(0, 5),
      s.break_minutes ?? 0,
    );
    if (s.is_overtime) overtimeHoursThisWeek += h;
    else contractualHoursThisWeek += h;
  }

  return {
    weeklyTarget,
    contractualHoursThisWeek,
    overtimeHoursThisWeek,
    weekStart,
    weekEnd,
  };
}

export async function upsertShiftAction(formData: FormData) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const id = String(formData.get("id") ?? "") || null;
  const employeeId = String(formData.get("employee_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("start_time") ?? "");
  const end = String(formData.get("end_time") ?? "");
  const breakMinutes = Number(formData.get("break_minutes") ?? 0);
  const position = String(formData.get("position") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const siteIdRaw = String(formData.get("site_id") ?? "").trim();
  const siteId = siteIdRaw && siteIdRaw !== "none" ? siteIdRaw : null;
  const isOvertime = String(formData.get("is_overtime") ?? "") === "on";
  const overtimeMultiplierRaw = String(formData.get("overtime_multiplier") ?? "");
  const overtimeMultiplier = isOvertime
    ? Number(overtimeMultiplierRaw) || 1.5
    : null;

  if (!employeeId || !date || !start || !end) return { error: "Employé, date et horaires requis." };
  if (start >= end) return { error: "L'heure de fin doit être après l'heure de début." };

  // Regle fondamentale Karim 2026-05-13 : aucune CREATION d'un nouveau shift
  // < J+1. Une MODIF d'un shift existant (passe ou present) reste autorisee
  // (rectification d'historique). La regle s'applique uniquement aux insertions.
  if (!id) {
    const tomorrowISO = toISODate(addDays(new Date(), 1));
    if (date < tomorrowISO) {
      return {
        error: `Création impossible le ${date} : la planification commence à partir de J+1 (${tomorrowISO}). Pour rattraper un shift passé, modifie un shift existant ou contacte l'admin.`,
      };
    }
  }

  const supabase = await createClient();

  // Karim 15/05/2026 v2 : REJET des chevauchements pour un meme employe le
  // meme jour. Cas observe : 10:15-17:45 regulier + 11:00-18:30 OT pour le
  // meme employe -> 14h double-comptees alors que l employe etait au site
  // ~8h elapsed. La regle "overlaps OK" du 2026-05-11 etait destinee au
  // scenario "1 shift contractuel 10-19h30 inclut 1 besoin critique
  // 14:30-17:30 du meme employe" mais elle ouvre la porte aux erreurs
  // d additionnement par 2 shifts independants. Si tu as besoin de couvrir
  // plusieurs creneaux avec 1 employe, cree 1 SEUL shift qui englobe
  // (l existing position/notes peuvent tagguer le creneau couvert).
  const newStart = start.slice(0, 5);
  const newEnd = end.slice(0, 5);
  // Karim 15/05 : check anti-overlap respecte org_settings.autoplaner_rules.
  // Si la regle anti_overlap_same_employee est OFF, on saute le check
  // (revient au comportement legacy "overlaps OK").
  const { data: orgRulesRow } = await supabase
    .from("org_settings")
    .select("autoplaner_rules")
    .eq("id", 1)
    .maybeSingle();
  const rulesCfg = mergeWithDefaults(
    (orgRulesRow as { autoplaner_rules: Record<string, unknown> | null } | null)
      ?.autoplaner_rules ?? null,
  );
  if (isRuleEnabled(rulesCfg, "anti_overlap_same_employee")) {
    const { data: sameDayRaw } = await supabase
      .from("shifts")
      .select("id, start_time, end_time, is_overtime")
      .eq("employee_id", employeeId)
      .eq("date", date);
    const sameDay = ((sameDayRaw ?? []) as Array<{
      id: string;
      start_time: string;
      end_time: string;
      is_overtime: boolean | null;
    }>).filter((s) => !id || s.id !== id);
    const overlap = sameDay.find((s) => {
      const sStart = s.start_time.slice(0, 5);
      const sEnd = s.end_time.slice(0, 5);
      return newStart < sEnd && newEnd > sStart;
    });
    if (overlap) {
      return {
        error: `Conflit horaire : un autre shift existe le ${date} (${overlap.start_time.slice(0, 5)}–${overlap.end_time.slice(0, 5)}${overlap.is_overtime ? " H. sup" : ""}). Modifie/supprime celui-ci d abord, ou cree un seul shift englobant.`,
      };
    }
  }

  // ── Fractionnement automatique au seuil du quota hebdo (Karim 2026-05-14)
  // Plus de blocage "Dépassement de contrat" — si le shift fait dépasser
  // weekly_hours, on l'epuise d'abord en contractuel puis on bascule en OT
  // au point exact d'epuisement. Le segment OT garde le break=0 (la pause
  // est rattachee au segment contractuel, en pratique pause repas avant
  // l'overtime).
  const monday = startOfWeek(new Date(date + "T00:00:00"));
  const sunday = addDays(monday, 6);
  const weekStart = toISODate(monday);
  const weekEnd = toISODate(sunday);

  const [{ data: emp }, { data: weekShiftsRaw }] = await Promise.all([
    supabase
      .from("employees")
      .select("weekly_hours")
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, start_time, end_time, break_minutes, is_overtime")
      .eq("employee_id", employeeId)
      .gte("date", weekStart)
      .lte("date", weekEnd),
  ]);

  const weeklyTarget =
    (emp as { weekly_hours: number | null } | null)?.weekly_hours ?? 38;
  const weekShifts = (weekShiftsRaw ?? []) as Array<{
    id: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    is_overtime: boolean | null;
  }>;

  // Heures contractuelles deja consommees cette semaine, hors shift en cours
  // d'edition (et hors ses eventuels split-partners dans le meme shiftgroup).
  let contractualBefore = 0;
  for (const s of weekShifts) {
    if (id && s.id === id) continue;
    if (s.is_overtime) continue;
    contractualBefore += shiftHours(
      s.start_time.slice(0, 5),
      s.end_time.slice(0, 5),
      s.break_minutes ?? 0,
    );
  }

  // Multiplicateur OT : utilise la valeur du formulaire si fournie, sinon 1.5.
  const otMultiplierForSplit = overtimeMultiplier ?? (isOvertime ? 1.5 : 1.5);

  const split = splitShiftForQuota({
    startTime: start.slice(0, 5),
    endTime: end.slice(0, 5),
    breakMinutes: breakMinutes,
    alreadyContractualHours: contractualBefore,
    weeklyTargetHours: weeklyTarget,
    otMultiplier: otMultiplierForSplit,
  });

  if (split.totalProductiveHours <= 0) {
    return { error: "Shift trop court (duree productive nulle apres pause)." };
  }

  // Helper : construit un payload de shift pour le DB.
  function payloadFor(seg: {
    start_time: string;
    end_time: string;
    break_minutes: number;
    is_overtime: boolean;
    overtime_multiplier: number | null;
  }) {
    return {
      employee_id: employeeId,
      date,
      start_time: seg.start_time,
      end_time: seg.end_time,
      break_minutes: seg.break_minutes,
      position,
      location,
      site_id: siteId,
      notes,
      is_overtime: seg.is_overtime,
      overtime_multiplier: seg.overtime_multiplier,
      created_by: profile.id,
    };
  }

  let createdIds: string[] = [];
  if (id) {
    // UPDATE : l'existant devient le premier segment present (regular si split,
    // sinon le segment unique). Si on a split, on INSERT le second segment.
    const primary = split.regular ?? split.overtime;
    if (!primary) return { error: "Aucun segment a sauvegarder." };
    const { error: errUpd } = await supabase
      .from("shifts")
      .update(payloadFor(primary))
      .eq("id", id);
    if (errUpd) return { error: errUpd.message };
    if (split.regular && split.overtime) {
      const { data: insOt, error: errIns } = await supabase
        .from("shifts")
        .insert(payloadFor(split.overtime))
        .select("id");
      if (errIns) return { error: errIns.message };
      createdIds = ((insOt ?? []) as Array<{ id: string }>).map((r) => r.id);
    }
  } else {
    // CREATE : insertion de 1 ou 2 segments selon le split.
    const rows: ReturnType<typeof payloadFor>[] = [];
    if (split.regular) rows.push(payloadFor(split.regular));
    if (split.overtime) rows.push(payloadFor(split.overtime));
    if (rows.length === 0) return { error: "Aucun segment a sauvegarder." };
    const { data: ins, error } = await supabase
      .from("shifts")
      .insert(rows)
      .select("id");
    if (error) return { error: error.message };
    createdIds = ((ins ?? []) as Array<{ id: string }>).map((r) => r.id);
  }

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return {
    ok: true,
    created_ids: createdIds,
    split:
      split.regular && split.overtime
        ? {
            regular_hours: +split.regularHours.toFixed(2),
            overtime_hours: +split.overtimeHours.toFixed(2),
            split_at: split.regular.end_time,
          }
        : null,
  };
}

/**
 * Karim 15/05/2026 : recopie 1+ shifts existants sur les N jours suivants.
 * Utilise par ShiftDialog quand l admin coche "Recopier sur N jours suivants".
 * Pour chaque shift source, on cree N clones (day+1..day+N) avec les memes
 * heures / site / break / employee / is_overtime / multiplier.
 * Skip silencieusement les jours qui chevauchent un shift existant du meme
 * employe (pas de double-booking, cf decision Karim 2026-05-11).
 */
export async function copyShiftsToNextDaysAction(args: {
  shiftIds: string[];
  daysCount: number;
}): Promise<{ ok?: boolean; error?: string; created?: number; skipped?: number }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  if (args.daysCount <= 0 || args.shiftIds.length === 0) {
    return { error: "Aucune copie demandee." };
  }
  if (args.daysCount > 31) {
    return { error: "Limite : 31 jours maximum par operation de copie." };
  }
  const supabase = await createClient();
  const { data: sourcesRaw, error: selErr } = await supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time, break_minutes, position, location, site_id, notes, is_overtime, overtime_multiplier")
    .in("id", args.shiftIds);
  if (selErr) return { error: selErr.message };
  const sources = (sourcesRaw ?? []) as Array<{
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
  }>;
  if (sources.length === 0) return { error: "Shift(s) source introuvable(s)." };

  type Row = {
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
    status: "planned";
    created_by: string;
  };
  const rowsToInsert: Row[] = [];
  for (const src of sources) {
    for (let d = 1; d <= args.daysCount; d++) {
      const nextDate = toISODate(addDays(new Date(src.date + "T00:00:00"), d));
      rowsToInsert.push({
        employee_id: src.employee_id,
        date: nextDate,
        start_time: src.start_time,
        end_time: src.end_time,
        break_minutes: src.break_minutes,
        position: src.position,
        location: src.location,
        site_id: src.site_id,
        notes: src.notes,
        is_overtime: src.is_overtime,
        overtime_multiplier: src.overtime_multiplier,
        status: "planned",
        created_by: profile.id,
      });
    }
  }

  // Vérifie quels jours sont déjà occupés (anti-double-booking) -> skip ceux-là.
  const empIds = [...new Set(sources.map((s) => s.employee_id))];
  const minDate = rowsToInsert.reduce((m, r) => (r.date < m ? r.date : m), rowsToInsert[0]?.date ?? "");
  const maxDate = rowsToInsert.reduce((m, r) => (r.date > m ? r.date : m), rowsToInsert[0]?.date ?? "");
  const { data: existingRaw } = await supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time")
    .in("employee_id", empIds)
    .gte("date", minDate)
    .lte("date", maxDate);
  const existing = (existingRaw ?? []) as Array<{
    employee_id: string; date: string; start_time: string; end_time: string;
  }>;
  function overlaps(empId: string, date: string, sNew: string, eNew: string): boolean {
    return existing.some((e) => {
      if (e.employee_id !== empId || e.date !== date) return false;
      return sNew.slice(0, 5) < e.end_time.slice(0, 5) && eNew.slice(0, 5) > e.start_time.slice(0, 5);
    });
  }
  const filtered = rowsToInsert.filter(
    (r) => !overlaps(r.employee_id, r.date, r.start_time, r.end_time),
  );
  const skipped = rowsToInsert.length - filtered.length;
  if (filtered.length === 0) {
    return { ok: true, created: 0, skipped };
  }
  const { error } = await supabase.from("shifts").insert(filtered);
  if (error) return { error: error.message };

  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true, created: filtered.length, skipped };
}

/**
 * Charge les besoins is_enabled=true du site pour le jour de la semaine
 * correspondant a `dateISO`, et calcule l'heure d'ouverture du magasin ce
 * jour-la (= min start_time parmi les creneaux actifs). Utilise par le
 * ShiftDialog pour proposer des creneaux pre-remplis et appliquer
 * l'alignement d'office (snap a l'ouverture si <= 30 min apres).
 */
export async function loadSiteNeedsForDayAction(
  siteId: string,
  dateISO: string,
): Promise<{
  needs: Array<{
    id: string;
    start_time: string;
    end_time: string;
    headcount: number;
    role: string | null;
    is_critical: number | null;
  }>;
  open_time: string | null;
  close_time: string | null;
}> {
  await requireRole(["admin", "rh", "manager"]);
  if (!siteId || siteId === "none") {
    return { needs: [], open_time: null, close_time: null };
  }
  const d = new Date(dateISO + "T00:00:00");
  const dow = d.getDay(); // 0=Dim..6=Sam

  const supabase = await createClient();
  const { data } = await supabase
    .from("site_needs")
    .select("id, start_time, end_time, headcount, role, is_critical")
    .eq("site_id", siteId)
    .eq("day_of_week", dow)
    .eq("is_enabled", true)
    .order("start_time");
  const needs = (data ?? []) as Array<{
    id: string;
    start_time: string;
    end_time: string;
    headcount: number;
    role: string | null;
    is_critical: number | null;
  }>;
  if (needs.length === 0) {
    return { needs: [], open_time: null, close_time: null };
  }
  const open = needs.reduce(
    (acc, n) => (acc < n.start_time.slice(0, 5) ? acc : n.start_time.slice(0, 5)),
    needs[0].start_time.slice(0, 5),
  );
  const close = needs.reduce(
    (acc, n) => (acc > n.end_time.slice(0, 5) ? acc : n.end_time.slice(0, 5)),
    needs[0].end_time.slice(0, 5),
  );
  return { needs, open_time: open, close_time: close };
}

/**
 * Charge les indispos declarees par un employe qui MATCHENT une date donnee
 * (recurrence par day_of_week OU date_specific). Utilise par ShiftDialog
 * pour afficher un warning souple si l'horaire saisi chevauche une indispo.
 * Decision Karim 2026-05-12 : warning, pas blocage.
 */
export async function loadEmployeeUnavailabilitiesForDayAction(
  employeeId: string,
  dateISO: string,
): Promise<{
  items: Array<{
    id: string;
    start_time: string | null;
    end_time: string | null;
    day_of_week: number | null;
    date_specific: string | null;
    notes: string | null;
  }>;
}> {
  await requireRole(["admin", "rh", "manager"]);
  if (!employeeId || !dateISO) return { items: [] };
  const d = new Date(dateISO + "T00:00:00");
  const dow = d.getDay(); // 0=Dim..6=Sam

  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_unavailabilities")
    .select("id, start_time, end_time, day_of_week, date_specific, notes, is_active")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .or(`day_of_week.eq.${dow},date_specific.eq.${dateISO}`);
  const items = ((data ?? []) as Array<{
    id: string;
    start_time: string | null;
    end_time: string | null;
    day_of_week: number | null;
    date_specific: string | null;
    notes: string | null;
    is_active: boolean;
  }>)
    .filter((u) => u.day_of_week === dow || u.date_specific === dateISO)
    .map((u) => ({
      id: u.id,
      start_time: u.start_time,
      end_time: u.end_time,
      day_of_week: u.day_of_week,
      date_specific: u.date_specific,
      notes: u.notes,
    }));
  return { items };
}

/**
 * Charge tous les shifts existants d un employe sur une date donnee.
 * Karim 15/05 : utilise par ShiftDialog pour pre-remplir intelligemment
 * les heures (endeans l ouverture, hors creneaux deja occupes).
 */
export async function loadEmployeeDayShiftsAction(
  employeeId: string,
  dateISO: string,
  excludeShiftId?: string | null,
): Promise<{
  items: Array<{
    id: string;
    start_time: string;
    end_time: string;
    is_overtime: boolean | null;
  }>;
}> {
  await requireRole(["admin", "rh", "manager"]);
  if (!employeeId || !dateISO) return { items: [] };
  const supabase = await createClient();
  let q = supabase
    .from("shifts")
    .select("id, start_time, end_time, is_overtime")
    .eq("employee_id", employeeId)
    .eq("date", dateISO)
    .order("start_time");
  if (excludeShiftId) q = q.neq("id", excludeShiftId);
  const { data } = await q;
  return {
    items: ((data ?? []) as Array<{
      id: string;
      start_time: string;
      end_time: string;
      is_overtime: boolean | null;
    }>).map((s) => ({
      id: s.id,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      is_overtime: s.is_overtime,
    })),
  };
}

/**
 * Reclasse les heures excedentaires d'un employe sur une semaine donnee :
 * pour les shifts contractuels qui depassent weekly_hours, on bascule en OT
 * les plus recents (par created_at DESC) jusqu'a ce que le contractuel
 * passe sous le quota. Decision Karim 2026-05-13 :
 *  - Action en 1 clic depuis la fiche employe calendar
 *  - Multiplier OT par defaut = 1.5 (loi BE samedi/dimanche).
 */
export async function reclassifyExcessAsOvertimeAction(args: {
  employeeId: string;
  weekISO: string;
  multiplier?: number;
}): Promise<{ ok?: boolean; error?: string; reclassified?: number; hoursReclassified?: number }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { employeeId, weekISO } = args;
  const multiplier = args.multiplier ?? 1.5;
  if (!employeeId || !weekISO) return { error: "Param requis." };

  const monday = startOfWeek(new Date(weekISO + "T00:00:00"));
  const sunday = addDays(monday, 6);
  const weekStart = toISODate(monday);
  const weekEnd = toISODate(sunday);

  const [{ data: emp }, { data: shiftsRaw }] = await Promise.all([
    supabase
      .from("employees")
      .select("weekly_hours, full_name")
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, start_time, end_time, break_minutes, is_overtime, created_at")
      .eq("employee_id", employeeId)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("created_at", { ascending: false }),
  ]);

  const weeklyTarget =
    (emp as { weekly_hours: number | null } | null)?.weekly_hours ?? 38;
  const allShifts = (shiftsRaw ?? []) as Array<{
    id: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    is_overtime: boolean | null;
    created_at: string;
  }>;
  const contractShifts = allShifts.filter((s) => !s.is_overtime);
  let totalContract = 0;
  for (const s of contractShifts) {
    totalContract += shiftHours(
      s.start_time.slice(0, 5),
      s.end_time.slice(0, 5),
      s.break_minutes ?? 0,
    );
  }
  if (totalContract <= weeklyTarget + 0.01) {
    return { ok: true, reclassified: 0, hoursReclassified: 0 };
  }

  // On reclasse les plus recents (deja tries DESC) jusqu'a passer sous le quota.
  const toReclassify: string[] = [];
  let hoursReclassified = 0;
  let remaining = totalContract;
  for (const s of contractShifts) {
    if (remaining <= weeklyTarget + 0.01) break;
    const h = shiftHours(
      s.start_time.slice(0, 5),
      s.end_time.slice(0, 5),
      s.break_minutes ?? 0,
    );
    toReclassify.push(s.id);
    hoursReclassified += h;
    remaining -= h;
  }

  if (toReclassify.length === 0) {
    return { ok: true, reclassified: 0, hoursReclassified: 0 };
  }

  const { error } = await supabase
    .from("shifts")
    .update({ is_overtime: true, overtime_multiplier: multiplier })
    .in("id", toReclassify);
  if (error) return { error: error.message };

  revalidatePath("/planning", "layout");
  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true, reclassified: toReclassify.length, hoursReclassified };
}

/**
 * Deplace un shift d'un employe/date a un autre (drag & drop dans le board).
 * Karim 2026-05-13 : le RH doit pouvoir glisser-deposer dans la vue d'ensemble.
 * - Conserve start_time/end_time/site/role/notes/is_overtime
 * - Refuse de deplacer sur date < J+1 (regle fondamentale realisme)
 * - Anti-double-booking : si l'employe cible a deja un shift overlap, on bloque.
 */
export async function moveShiftAction(args: {
  shiftId: string;
  toEmployeeId?: string;
  toDate: string;
  toSiteId?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const { shiftId, toDate } = args;
  if (!shiftId || !toDate) return { error: "Param requis." };

  const tomorrowISO = toISODate(addDays(new Date(), 1));
  if (toDate < tomorrowISO) {
    return { error: `Déplacement impossible sur ${toDate} (date passée ou aujourd'hui).` };
  }

  const supabase = await createClient();
  const { data: src } = await supabase
    .from("shifts")
    .select("id, employee_id, date, start_time, end_time, break_minutes, is_overtime, site_id")
    .eq("id", shiftId)
    .maybeSingle();
  if (!src) return { error: "Shift introuvable." };
  const s = src as {
    id: string;
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    is_overtime: boolean | null;
    site_id: string | null;
  };

  // toEmployeeId / toSiteId optionnels : par defaut on garde la valeur courante.
  const newEmpId = args.toEmployeeId ?? s.employee_id;
  const newSiteId = args.toSiteId !== undefined ? args.toSiteId : s.site_id;

  // No-op si rien ne change
  if (newEmpId === s.employee_id && toDate === s.date && newSiteId === s.site_id) {
    return { ok: true };
  }

  // Anti-double-booking : check overlap sur la nouvelle position (employe + date)
  const { data: conflicts } = await supabase
    .from("shifts")
    .select("id, start_time, end_time")
    .eq("employee_id", newEmpId)
    .eq("date", toDate)
    .neq("id", shiftId);
  const overlap = ((conflicts ?? []) as Array<{ id: string; start_time: string; end_time: string }>).some(
    (c) => s.start_time < c.end_time && s.end_time > c.start_time,
  );
  if (overlap) {
    return { error: `Conflit horaire sur ${toDate} pour cet employé (déjà un shift sur ce créneau).` };
  }

  const update: { employee_id: string; date: string; site_id?: string | null } = {
    employee_id: newEmpId,
    date: toDate,
  };
  if (newSiteId !== s.site_id) update.site_id = newSiteId;

  const { error } = await supabase
    .from("shifts")
    .update(update)
    .eq("id", shiftId);
  if (error) return { error: error.message };
  revalidatePath("/planning", "layout");
  return { ok: true };
}

export async function deleteShiftAction(id: string) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true };
}

export async function decideTimeOffAction(id: string, decision: "approved" | "rejected") {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("time_off_requests")
    .update({
      status: decision,
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/planning/time-off");
  revalidatePath("/me/time-off");
  return { ok: true };
}

export async function createEmployeeAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const contractType = String(formData.get("contract_type") ?? "CDI").trim();
  const weeklyHours = Number(formData.get("weekly_hours") ?? 38);
  const departmentId = String(formData.get("department_id") ?? "") || null;
  const startDate = String(formData.get("start_date") ?? "") || new Date().toISOString().split("T")[0];

  if (!email || !fullName) return { error: "Nom et email requis." };

  const { error } = await supabase.from("employees").insert({
    email, full_name: fullName, job_title: jobTitle || "À définir",
    contract_type: contractType, weekly_hours: weeklyHours,
    department_id: departmentId, start_date: startDate,
  });
  if (error) return { error: error.message };
  revalidatePath("/planning/employees");
  return { ok: true };
}

export async function archiveEmployeeAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ status: "archived", end_date: new Date().toISOString().split("T")[0] })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/planning/employees");
  return { ok: true };
}

export async function requestTimeOffAction(formData: FormData) {
  const { user } = await requireProfile();
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, manager_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const e = emp as unknown as { id: string; full_name: string; manager_id: string | null } | null;
  if (!e?.id) return { error: "Tu n'es pas enregistré comme employé actif." };

  const kind = String(formData.get("kind") ?? "vacation");
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!startDate || !endDate) return { error: "Dates requises." };
  if (startDate > endDate) return { error: "La date de fin doit être après la date de début." };

  // Sick leave : pas d'auto-validation (déclaratif, validation médicale RH).
  // On garde le flux pending classique pour ce kind.
  const { data: inserted, error } = await supabase
    .from("time_off_requests")
    .insert({
      employee_id: e.id,
      kind: kind as "vacation" | "sick" | "personal" | "unpaid" | "other",
      start_date: startDate,
      end_date: endDate,
      reason,
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: error?.message ?? "Insertion impossible." };
  const newId = (inserted as { id: string }).id;

  // Auto-validation : seulement vacation / personal / unpaid / other.
  if (kind !== "sick") {
    try {
      const evalRes = await evaluateLeaveRequest({
        employeeId: e.id,
        startDate,
        endDate,
        kind,
        excludeRequestId: newId,
      });

      if (evalRes.shouldAutoValidate) {
        await supabase
          .from("time_off_requests")
          .update({
            status: "approved",
            auto_validated: true,
            auto_validation_reason: "all_rules_passed",
            decided_at: new Date().toISOString(),
            decided_by: null,
          })
          .eq("id", newId);
        revalidatePath("/me/time-off");
        revalidatePath("/planning/time-off");
        return {
          ok: true,
          auto_validated: true,
          recommendation: evalRes.recommendation,
          reason_code: "all_rules_passed",
        };
      }

      // Pas auto-validé : on stocke la première raison pour audit / UI manager.
      const firstReason = evalRes.reasons[0] ?? "manual_override";
      await supabase
        .from("time_off_requests")
        .update({ auto_validation_reason: firstReason })
        .eq("id", newId);

      // Notif manager si la table existe et qu'on a un manager assigné.
      if (e.manager_id) {
        try {
          await supabase.from("notifications").insert({
            recipient_id: e.manager_id,
            kind: "time_off_pending",
            title: "Demande de congé à valider",
            body: `${e.full_name} demande un congé du ${startDate} au ${endDate}. Raison escalade : ${describeAutoReason(firstReason)}.`,
            link: "/planning/time-off",
            data: { request_id: newId, reason_code: firstReason },
          });
          await sendPushToProfile(e.manager_id, {
            title: "Congé à valider",
            body: `${e.full_name} demande ${startDate} → ${endDate}.`,
            link: "/planning/time-off",
            priority: "important",
            tag: `time-off-${newId}`,
          });
        } catch {
          // notifications optionnelle — ignore silencieusement.
        }
      }

      revalidatePath("/me/time-off");
      revalidatePath("/planning/time-off");
      return {
        ok: true,
        auto_validated: false,
        recommendation: evalRes.recommendation,
        reason_code: firstReason,
      };
    } catch {
      // Si l'évaluation crashe, on laisse la demande pending — fail-safe.
      revalidatePath("/me/time-off");
      revalidatePath("/planning/time-off");
      return { ok: true, auto_validated: false, recommendation: "escalate_to_manager" as const };
    }
  }

  revalidatePath("/me/time-off");
  revalidatePath("/planning/time-off");
  return { ok: true, auto_validated: false, recommendation: "escalate_to_manager" as const };
}

export async function cancelTimeOffAction(id: string) {
  const { user } = await requireProfile();
  const supabase = await createClient();
  // RLS ensures only own pending requests can be updated
  const { error } = await supabase
    .from("time_off_requests")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/me/time-off");
  return { ok: true };
}
