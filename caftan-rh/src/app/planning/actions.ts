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

  // Anti-chevauchement : on charge les shifts existants pour cet employé sur
  // cette date et on vérifie qu'aucun autre shift ne se croise avec celui que
  // l'on est en train d'insérer / modifier. Les shifts qui se *touchent* au
  // point exact sont autorisés (10h-14h + 14h-20h OK).
  const { data: existingRaw } = await supabase
    .from("shifts")
    .select("id, start_time, end_time")
    .eq("employee_id", employeeId)
    .eq("date", date);
  const existing = (existingRaw ?? []) as Array<{
    id: string;
    start_time: string;
    end_time: string;
  }>;
  const newStart = start.slice(0, 5);
  const newEnd = end.slice(0, 5);
  const conflict = existing.find((s) => {
    if (id && s.id === id) return false; // on ignore le shift en cours d'édition
    const s2 = s.start_time.slice(0, 5);
    const e2 = s.end_time.slice(0, 5);
    return shiftOverlaps(newStart, newEnd, s2, e2);
  });
  if (conflict) {
    return {
      error: `Ce shift chevauche un autre shift existant pour cet employé : ${conflict.start_time.slice(0, 5)}-${conflict.end_time.slice(0, 5)}. Modifie ou supprime l'autre d'abord.`,
    };
  }

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
    for (const s of weekShifts) {
      if (id && s.id === id) continue;
      if (s.is_overtime) continue;
      contractualBefore += shiftHours(
        s.start_time.slice(0, 5),
        s.end_time.slice(0, 5),
        s.break_minutes ?? 0,
      );
    }
    const thisShiftHours = shiftHours(newStart, newEnd, breakMinutes);
    const projected = contractualBefore + thisShiftHours;
    if (projected > weeklyTarget + 0.01) {
      const overBy = +(projected - weeklyTarget).toFixed(2);
      return {
        error: `Dépassement de contrat (${weeklyTarget}h/sem) sans autorisation OT : ${projected.toFixed(1)}h projetés (+${overBy}h). Active la case "Heures sup" ou réduis le shift.`,
      };
    }
  }

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

/** Test si [s1,e1] et [s2,e2] se chevauchent strictement (le toucher exact OK). */
function shiftOverlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 < e2 && e1 > s2;
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
