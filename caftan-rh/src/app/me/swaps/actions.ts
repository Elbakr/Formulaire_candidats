"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";
import { startOfWeek, weekRange, parseISODate, toISODate } from "@/lib/planning";
import { sendPushToProfile } from "@/lib/push-notify";

type Shift = {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  site_id: string | null;
};

type Off = { employee_id: string; start_date: string; end_date: string };

function toMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function shiftHours(s: Shift): number {
  return Math.max(0, toMin(s.end_time) - toMin(s.start_time) - (s.break_minutes ?? 0)) / 60;
}

function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return toMin(aS) < toMin(bE) && toMin(aE) > toMin(bS);
}

async function getMyEmployee(): Promise<
  | { id: string; full_name: string; weekly_hours: number | null }
  | { error: string }
> {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, weekly_hours")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const e = data as
    | { id: string; full_name: string; weekly_hours: number | null }
    | null;
  if (!e?.id) return { error: "Tu n'es pas enregistré comme employé actif." };
  return e;
}

/**
 * Évalue si un swap (ou couverture) peut être auto-validé.
 * Règles V1 :
 *  - Le shift à transférer (requester→target) ne doit PAS conflicter avec
 *    les shifts existants du target sur la même date/heure.
 *  - Si swap réciproque, idem dans l'autre sens.
 *  - Pas de target en congé approuvé sur la date.
 *  - Quota hebdo : la nouvelle charge ne doit pas dépasser de plus de 10%
 *    le `weekly_hours` du target (V1 souple). Idem pour requester si swap.
 *  - Compétences (position) : V1 considéré comme OK si position vide ou
 *    identique. Sinon → escalade manager.
 */
async function evaluateSwap(args: {
  requesterShift: Shift;
  targetShift: Shift | null;
  targetEmployeeId: string;
}): Promise<{
  canAutoValidate: boolean;
  checks: Record<string, boolean | string | number>;
  failedReasons: string[];
}> {
  const supabase = await createClient();
  const { requesterShift, targetShift, targetEmployeeId } = args;

  const reqEmpId = requesterShift.employee_id;
  const dateA = requesterShift.date;
  const dateB = targetShift?.date ?? requesterShift.date;
  const earliest = dateA < dateB ? dateA : dateB;
  const latest = dateA > dateB ? dateA : dateB;

  // Charge tous les shifts des 2 employés sur la fenêtre couvrant les 2 semaines.
  const monday1 = startOfWeek(parseISODate(earliest));
  const monday2 = startOfWeek(parseISODate(latest));
  const start = toISODate(monday1);
  const week2End = weekRange(monday2).end;
  const end = week2End;

  const [{ data: shiftsRaw }, { data: offRaw }, { data: empRaw }] = await Promise.all([
    supabase
      .from("shifts")
      .select(
        "id, employee_id, date, start_time, end_time, break_minutes, position, site_id",
      )
      .in("employee_id", [reqEmpId, targetEmployeeId])
      .gte("date", start)
      .lte("date", end),
    supabase
      .from("time_off_requests")
      .select("employee_id, start_date, end_date")
      .in("employee_id", [reqEmpId, targetEmployeeId])
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase
      .from("employees")
      .select("id, weekly_hours")
      .in("id", [reqEmpId, targetEmployeeId]),
  ]);

  const shifts = ((shiftsRaw ?? []) as Shift[]).slice();
  const offs = (offRaw ?? []) as Off[];
  const empMap = new Map<string, number>();
  for (const e of (empRaw ?? []) as Array<{ id: string; weekly_hours: number | null }>) {
    empMap.set(e.id, e.weekly_hours ?? 38);
  }

  const checks: Record<string, boolean | string | number> = {};
  const failed: string[] = [];

  // 1. Pas de congé approuvé du target sur dateA (jour où il prendrait le shift requester).
  const targetOnLeaveA = offs.some(
    (o) =>
      o.employee_id === targetEmployeeId &&
      dateA >= o.start_date &&
      dateA <= o.end_date,
  );
  checks.target_not_on_leave = !targetOnLeaveA;
  if (targetOnLeaveA) failed.push("target_on_leave");

  // 2. Si swap : pas de congé approuvé du requester sur dateB.
  if (targetShift) {
    const reqOnLeaveB = offs.some(
      (o) =>
        o.employee_id === reqEmpId &&
        dateB >= o.start_date &&
        dateB <= o.end_date,
    );
    checks.requester_not_on_leave = !reqOnLeaveB;
    if (reqOnLeaveB) failed.push("requester_on_leave");
  }

  // 3. Conflit horaire : target a-t-il déjà un shift sur dateA + horaire requesterShift ?
  const targetConflict = shifts.some(
    (s) =>
      s.employee_id === targetEmployeeId &&
      s.id !== (targetShift?.id ?? "") &&
      s.date === dateA &&
      overlaps(s.start_time, s.end_time, requesterShift.start_time, requesterShift.end_time),
  );
  checks.target_no_conflict = !targetConflict;
  if (targetConflict) failed.push("target_conflict");

  // 4. Si swap réciproque : requester sur dateB + horaire targetShift ?
  if (targetShift) {
    const reqConflict = shifts.some(
      (s) =>
        s.employee_id === reqEmpId &&
        s.id !== requesterShift.id &&
        s.date === dateB &&
        overlaps(s.start_time, s.end_time, targetShift.start_time, targetShift.end_time),
    );
    checks.requester_no_conflict = !reqConflict;
    if (reqConflict) failed.push("requester_conflict");
  }

  // 5. Compétences (position).
  if (targetShift && requesterShift.position && targetShift.position) {
    const same = requesterShift.position === targetShift.position;
    checks.same_position = same;
    if (!same) failed.push("position_mismatch");
  } else {
    checks.same_position = true;
  }

  // 6. Quota hebdo target : sa charge actuelle (sans le draft) + le shift A
  //    ne doit pas dépasser weekly_hours * 1.10.
  const wA = startOfWeek(parseISODate(dateA));
  const { start: wAS, end: wAE } = weekRange(wA);
  const targetWeekHours = shifts
    .filter(
      (s) =>
        s.employee_id === targetEmployeeId &&
        s.date >= wAS &&
        s.date <= wAE &&
        s.id !== (targetShift?.id ?? ""),
    )
    .reduce((acc, s) => acc + shiftHours(s), 0);
  const targetWeeklyMax = (empMap.get(targetEmployeeId) ?? 38) * 1.1;
  const newTargetHours = targetWeekHours + shiftHours(requesterShift);
  checks.target_within_quota = newTargetHours <= targetWeeklyMax;
  checks.target_new_hours = Number(newTargetHours.toFixed(1));
  checks.target_max_hours = Number(targetWeeklyMax.toFixed(1));
  if (newTargetHours > targetWeeklyMax) failed.push("target_quota_exceeded");

  // 7. Quota hebdo requester (uniquement si swap réciproque).
  if (targetShift) {
    const wB = startOfWeek(parseISODate(dateB));
    const { start: wBS, end: wBE } = weekRange(wB);
    const reqWeekHours = shifts
      .filter(
        (s) =>
          s.employee_id === reqEmpId &&
          s.date >= wBS &&
          s.date <= wBE &&
          s.id !== requesterShift.id,
      )
      .reduce((acc, s) => acc + shiftHours(s), 0);
    const reqWeeklyMax = (empMap.get(reqEmpId) ?? 38) * 1.1;
    const newReqHours = reqWeekHours + shiftHours(targetShift);
    checks.requester_within_quota = newReqHours <= reqWeeklyMax;
    checks.requester_new_hours = Number(newReqHours.toFixed(1));
    checks.requester_max_hours = Number(reqWeeklyMax.toFixed(1));
    if (newReqHours > reqWeeklyMax) failed.push("requester_quota_exceeded");
  }

  return {
    canAutoValidate: failed.length === 0,
    checks,
    failedReasons: failed,
  };
}

export async function requestSwapAction(input: {
  requesterShiftId: string;
  targetEmployeeId?: string;
  targetShiftId?: string;
  reason?: string;
}): Promise<{ ok?: boolean; error?: string; swapId?: string }> {
  const me = await getMyEmployee();
  if ("error" in me) return me;
  const supabase = await createClient();

  // Charge le shift du requester (et vérifie ownership).
  const { data: rs } = await supabase
    .from("shifts")
    .select("id, employee_id, date, start_time, end_time, break_minutes, position, site_id, status")
    .eq("id", input.requesterShiftId)
    .maybeSingle();
  const requesterShift = rs as (Shift & { status: string }) | null;
  if (!requesterShift) return { error: "Shift introuvable." };
  if (requesterShift.employee_id !== me.id) {
    return { error: "Ce shift ne t'appartient pas." };
  }

  if (input.targetEmployeeId === me.id) {
    return { error: "Tu ne peux pas échanger avec toi-même." };
  }

  // Anti-doublon : pas 2 swaps pending sur le même requester_shift_id.
  const { data: existing } = await supabase
    .from("shift_swap_requests")
    .select("id")
    .eq("requester_shift_id", input.requesterShiftId)
    .in("status", ["pending", "accepted"]);
  if (((existing ?? []) as Array<{ id: string }>).length > 0) {
    return { error: "Une demande est déjà en cours sur ce shift." };
  }

  const insertPayload: Record<string, unknown> = {
    requester_employee_id: me.id,
    requester_shift_id: input.requesterShiftId,
    reason: input.reason?.trim() ? input.reason.trim() : null,
  };
  if (input.targetEmployeeId) insertPayload.target_employee_id = input.targetEmployeeId;
  if (input.targetShiftId) insertPayload.target_shift_id = input.targetShiftId;

  const { data: created, error } = await supabase
    .from("shift_swap_requests")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? "Création échouée." };
  const swapId = (created as { id: string }).id;

  // Si une cible est désignée, on lui notifie + push.
  if (input.targetEmployeeId) {
    try {
      const admin = createAdminClient();
      const { data: tgt } = await admin
        .from("employees")
        .select("profile_id, full_name")
        .eq("id", input.targetEmployeeId)
        .maybeSingle();
      const targetProfileId = (tgt as { profile_id: string | null } | null)?.profile_id;
      if (targetProfileId) {
        await admin.from("notifications").insert({
          recipient_id: targetProfileId,
          kind: "swap_pending",
          title: "Demande d'échange",
          body: `${me.full_name} te propose un échange. Réponds dans /me/swaps.`,
          link: "/me/swaps",
          data: { swap_id: swapId },
        });
        await sendPushToProfile(targetProfileId, {
          title: "Demande d'échange",
          body: `${me.full_name} te propose un échange. Ouvre pour répondre.`,
          link: "/me/swaps",
          priority: "important",
          tag: `swap-${swapId}`,
        });
      }
    } catch {
      /* push/notif best effort */
    }
  }

  revalidatePath("/me/swaps");
  return { ok: true, swapId };
}

export async function acceptSwapAction(
  swapId: string,
): Promise<{
  ok?: boolean;
  error?: string;
  autoValidated?: boolean;
  needsManagerReview?: boolean;
  reasons?: string[];
}> {
  const me = await getMyEmployee();
  if ("error" in me) return me;
  const supabase = await createClient();

  const { data: swapRaw } = await supabase
    .from("shift_swap_requests")
    .select(
      "id, requester_employee_id, requester_shift_id, target_employee_id, target_shift_id, status",
    )
    .eq("id", swapId)
    .maybeSingle();
  const swap = swapRaw as
    | {
        id: string;
        requester_employee_id: string;
        requester_shift_id: string;
        target_employee_id: string | null;
        target_shift_id: string | null;
        status: string;
      }
    | null;
  if (!swap) return { error: "Demande introuvable." };
  if (swap.target_employee_id !== me.id) {
    return { error: "Tu n'es pas le destinataire de cette demande." };
  }
  if (swap.status !== "pending") {
    return { error: "Cette demande n'est plus en attente." };
  }

  // Charge les shifts.
  const { data: rs } = await supabase
    .from("shifts")
    .select("id, employee_id, date, start_time, end_time, break_minutes, position, site_id")
    .eq("id", swap.requester_shift_id)
    .maybeSingle();
  const requesterShift = rs as Shift | null;
  if (!requesterShift) return { error: "Shift demandeur introuvable." };

  let targetShift: Shift | null = null;
  if (swap.target_shift_id) {
    const { data: ts } = await supabase
      .from("shifts")
      .select("id, employee_id, date, start_time, end_time, break_minutes, position, site_id")
      .eq("id", swap.target_shift_id)
      .maybeSingle();
    targetShift = ts as Shift | null;
    if (!targetShift) return { error: "Shift cible introuvable." };
  }

  // Évalue.
  const evalRes = await evaluateSwap({
    requesterShift,
    targetShift,
    targetEmployeeId: me.id,
  });

  if (evalRes.canAutoValidate) {
    // Applique le swap.
    const { error: errA } = await supabase
      .from("shifts")
      .update({ employee_id: me.id })
      .eq("id", swap.requester_shift_id);
    if (errA) return { error: errA.message };
    if (targetShift) {
      const { error: errB } = await supabase
        .from("shifts")
        .update({ employee_id: swap.requester_employee_id })
        .eq("id", targetShift.id);
      if (errB) return { error: errB.message };
    }
    await supabase
      .from("shift_swap_requests")
      .update({
        status: "auto_validated",
        auto_validated: true,
        auto_validation_check: evalRes.checks,
        decided_at: new Date().toISOString(),
        decided_by: null,
      })
      .eq("id", swap.id);

    revalidatePath("/me/swaps");
    revalidatePath("/me/planning");
    revalidatePath("/planning/calendar");
    revalidatePath("/planning/swaps");
    return { ok: true, autoValidated: true };
  }

  // Sinon escalade manager : on marque accepted+needs_manager_review.
  await supabase
    .from("shift_swap_requests")
    .update({
      status: "accepted",
      auto_validated: false,
      auto_validation_check: evalRes.checks,
      needs_manager_review: true,
      manager_review_reason: evalRes.failedReasons.join(",") || "manual_review",
    })
    .eq("id", swap.id);

  // Notif manager (best effort).
  try {
    const { data: emps } = await supabase
      .from("employees")
      .select("id, full_name, manager_id")
      .in("id", [swap.requester_employee_id, me.id]);
    const reqEmp = ((emps ?? []) as Array<{ id: string; full_name: string; manager_id: string | null }>)
      .find((e) => e.id === swap.requester_employee_id);
    if (reqEmp?.manager_id) {
      await supabase.from("notifications").insert({
        recipient_id: reqEmp.manager_id,
        kind: "shift_swap_review",
        title: "Échange de shift à valider",
        body: `${reqEmp.full_name} ↔ ${me.full_name} — règles non remplies (${evalRes.failedReasons.join(", ")}). À arbitrer.`,
        link: "/planning/swaps",
        data: { swap_id: swap.id, reasons: evalRes.failedReasons },
      });
    }
  } catch {
    // optionnel
  }

  revalidatePath("/me/swaps");
  revalidatePath("/planning/swaps");
  return {
    ok: true,
    autoValidated: false,
    needsManagerReview: true,
    reasons: evalRes.failedReasons,
  };
}

export async function rejectSwapAction(
  swapId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getMyEmployee();
  if ("error" in me) return me;
  const supabase = await createClient();

  const { data: swap } = await supabase
    .from("shift_swap_requests")
    .select("id, target_employee_id, status")
    .eq("id", swapId)
    .maybeSingle();
  const s = swap as
    | { id: string; target_employee_id: string | null; status: string }
    | null;
  if (!s) return { error: "Demande introuvable." };
  if (s.target_employee_id !== me.id) return { error: "Pas autorisé." };
  if (s.status !== "pending") return { error: "Demande déjà décidée." };

  const { error } = await supabase
    .from("shift_swap_requests")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
    })
    .eq("id", swapId);
  if (error) return { error: error.message };
  revalidatePath("/me/swaps");
  return { ok: true };
}

export async function cancelSwapAction(
  swapId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getMyEmployee();
  if ("error" in me) return me;
  const supabase = await createClient();

  const { data: swap } = await supabase
    .from("shift_swap_requests")
    .select("id, requester_employee_id, status")
    .eq("id", swapId)
    .maybeSingle();
  const s = swap as
    | { id: string; requester_employee_id: string; status: string }
    | null;
  if (!s) return { error: "Demande introuvable." };
  if (s.requester_employee_id !== me.id) return { error: "Pas autorisé." };
  if (s.status !== "pending" && s.status !== "accepted") {
    return { error: "Trop tard pour annuler." };
  }
  const { error } = await supabase
    .from("shift_swap_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", swapId);
  if (error) return { error: error.message };
  revalidatePath("/me/swaps");
  return { ok: true };
}

export async function managerDecideSwapAction(
  swapId: string,
  decision: "approve" | "reject",
): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const { data: swap } = await supabase
    .from("shift_swap_requests")
    .select(
      "id, requester_employee_id, requester_shift_id, target_employee_id, target_shift_id, status",
    )
    .eq("id", swapId)
    .maybeSingle();
  const s = swap as
    | {
        id: string;
        requester_employee_id: string;
        requester_shift_id: string;
        target_employee_id: string | null;
        target_shift_id: string | null;
        status: string;
      }
    | null;
  if (!s) return { error: "Demande introuvable." };
  if (s.status === "auto_validated" || s.status === "rejected" || s.status === "cancelled" || s.status === "manager_approved" || s.status === "manager_rejected") {
    return { error: "Demande déjà décidée." };
  }

  if (decision === "reject") {
    await supabase
      .from("shift_swap_requests")
      .update({
        status: "manager_rejected",
        decided_at: new Date().toISOString(),
        decided_by: profile.id,
        needs_manager_review: false,
      })
      .eq("id", swapId);
    revalidatePath("/planning/swaps");
    revalidatePath("/me/swaps");
    return { ok: true };
  }

  // approve : applique le swap (transfert).
  if (!s.target_employee_id) return { error: "Aucun destinataire — impossible d'appliquer." };

  const { error: errA } = await supabase
    .from("shifts")
    .update({ employee_id: s.target_employee_id })
    .eq("id", s.requester_shift_id);
  if (errA) return { error: errA.message };

  if (s.target_shift_id) {
    const { error: errB } = await supabase
      .from("shifts")
      .update({ employee_id: s.requester_employee_id })
      .eq("id", s.target_shift_id);
    if (errB) return { error: errB.message };
  }

  await supabase
    .from("shift_swap_requests")
    .update({
      status: "manager_approved",
      decided_at: new Date().toISOString(),
      decided_by: profile.id,
      needs_manager_review: false,
    })
    .eq("id", swapId);

  revalidatePath("/planning/swaps");
  revalidatePath("/me/swaps");
  revalidatePath("/me/planning");
  revalidatePath("/planning/calendar");
  return { ok: true };
}
