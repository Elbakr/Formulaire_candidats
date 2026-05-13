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

  const supabase = await createClient();

  // Chevauchements autorisés (décision Karim 2026-05-11) : un même employé
  // peut avoir plusieurs shifts qui se chevauchent dans la journée — utile
  // pour couvrir un besoin critique 14:30-17:30 *à l'intérieur* d'un shift
  // contractuel 10:00-19:30. On n'envoie plus aucun bloc anti-overlap ici ;
  // la responsabilité revient au RH de ne pas dupliquer un même créneau.
  const newStart = start.slice(0, 5);
  const newEnd = end.slice(0, 5);

  // ── Validation contrat hebdo : si le shift est marqué "contractuel"
  // (is_overtime=false) et qu'il fait dépasser weekly_hours pour la semaine,
  // on bloque avec un message demandant explicitement is_overtime=true.
  // On exclut le shift en cours d'édition pour ne pas le compter deux fois.
  if (!isOvertime) {
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
    let contractualBefore = 0;
    let oldShiftHours = 0;
    for (const s of weekShifts) {
      if (id && s.id === id) {
        // Shift en cours d'edition : on retient sa duree avant modif pour
        // comparer "ancien total" vs "nouveau total".
        if (!s.is_overtime) {
          oldShiftHours = shiftHours(
            s.start_time.slice(0, 5),
            s.end_time.slice(0, 5),
            s.break_minutes ?? 0,
          );
        }
        continue;
      }
      if (s.is_overtime) continue;
      contractualBefore += shiftHours(
        s.start_time.slice(0, 5),
        s.end_time.slice(0, 5),
        s.break_minutes ?? 0,
      );
    }
    const thisShiftHours = shiftHours(newStart, newEnd, breakMinutes);
    const projected = contractualBefore + thisShiftHours;

    // Karim 2026-05-13 : on ne bloque QUE si la modif AGGRAVE le depassement.
    // Si la semaine etait deja au-dessus du quota (cas historique) et que
    // l'admin modifie un shift sans augmenter sa duree (changement d'horaire,
    // de site, de poste), on laisse passer. Bloquer seulement quand thisShiftHours
    // > oldShiftHours (cas creation = oldShiftHours=0, cas modif qui augmente).
    if (projected > weeklyTarget + 0.01 && thisShiftHours > oldShiftHours + 0.01) {
      const overBy = +(projected - weeklyTarget).toFixed(2);
      const delta = +(thisShiftHours - oldShiftHours).toFixed(2);
      const action = id ? "Cette modif ajoute" : "Ce shift ajoute";
      return {
        error: `Dépassement de contrat (${weeklyTarget}h/sem) sans autorisation OT : ${projected.toFixed(1)}h projetés (+${overBy}h). ${action} ${delta}h. Active la case "Heures sup" ou réduis le shift.`,
      };
    }
  }
  // Note (Karim 2026-05-13) : la garde anti-OT-prematuree etait trop stricte
  // en creation manuelle. Si l'admin coche explicitement "Heures sup" dans
  // le ShiftDialog, sa decision RH prime -- on laisse passer meme si le
  // quota contractuel n'est pas encore sature. La garde reste active dans
  // commitIndividualOvertimeAction (workflow auto OT case-par-case) ou elle
  // a du sens (eviter de proposer de l'OT a des employes qui pourraient
  // encore prendre du contractuel).

  const payload = {
    employee_id: employeeId,
    date,
    start_time: start,
    end_time: end,
    break_minutes: breakMinutes,
    position,
    location,
    site_id: siteId,
    notes,
    is_overtime: isOvertime,
    overtime_multiplier: overtimeMultiplier,
    created_by: profile.id,
  };

  if (id) {
    const { error } = await supabase.from("shifts").update(payload).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("shifts").insert(payload);
    if (error) return { error: error.message };
  }
  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true };
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
