"use server";

// Server actions pour declarer un employe en conge "non programme" (depart
// rapide depuis la fiche RH). Karim 20/05 : "fin est facultatif", quand non
// fournie on utilise la sentinelle 9999-12-31 pour signifier "ouvert".

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const OPEN_END_SENTINEL = "9999-12-31";

type LeaveKind = "vacation" | "sick" | "personal" | "unpaid" | "other";

export async function markEmployeeOnLeaveAction(input: {
  employeeId: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // optional, null=ouverte
  kind: LeaveKind;
  reason?: string | null;
  deleteShiftsInRange?: boolean; // si true, supprime les shifts dans la periode
}) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  if (!input.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    return { error: "Date de début invalide" };
  }
  const start = input.startDate;
  const end = input.endDate && /^\d{4}-\d{2}-\d{2}$/.test(input.endDate)
    ? input.endDate
    : OPEN_END_SENTINEL;
  if (end < start) {
    return { error: "Date de fin avant date de début" };
  }

  // Insert demande approuvee directement (RH cree -> approuve)
  const { data: { user } } = await supabase.auth.getUser();
  const { data: row, error } = await supabase
    .from("time_off_requests")
    .insert({
      employee_id: input.employeeId,
      kind: input.kind,
      start_date: start,
      end_date: end,
      status: "approved",
      reason: input.reason ?? null,
      decided_by: user?.id ?? null,
      decided_at: new Date().toISOString(),
      auto_validated: false,
      auto_validation_reason: end === OPEN_END_SENTINEL ? "Saisie RH conge sans fin" : "Saisie RH conge ferme",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  let removedShifts = 0;
  if (input.deleteShiftsInRange) {
    // Supprime les shifts contractuels et OT dans la periode (clear week-like)
    const effectiveEnd = end === OPEN_END_SENTINEL
      ? // si conge ouvert, on supprime les shifts jusqu a aujourd hui + 90j
        new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
      : end;
    const { data: del } = await supabase
      .from("shifts")
      .delete()
      .eq("employee_id", input.employeeId)
      .gte("date", start)
      .lte("date", effectiveEnd)
      .select("id");
    removedShifts = del?.length ?? 0;
  }

  revalidatePath(`/planning/employees/${input.employeeId}`);
  revalidatePath(`/planning/employees/${input.employeeId}/calendar`);
  revalidatePath(`/planning/calendar`);
  revalidatePath(`/planning/all-sites`);
  return {
    ok: true,
    id: row?.id,
    openEnded: end === OPEN_END_SENTINEL,
    removedShifts,
  };
}

export async function cancelLeaveAction(input: { leaveId: string }) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("time_off_requests")
    .update({ status: "cancelled", auto_validation_reason: "Annule par RH" })
    .eq("id", input.leaveId);
  if (error) return { error: error.message };
  revalidatePath(`/planning/calendar`);
  return { ok: true };
}

export async function endEmployeeLeaveAction(input: {
  leaveId: string;
  endDate: string;
}) {
  await requireRole(["admin", "rh", "manager"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    return { error: "Date de fin invalide" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("time_off_requests")
    .update({ end_date: input.endDate, auto_validation_reason: "Conge cloture manuellement" })
    .eq("id", input.leaveId);
  if (error) return { error: error.message };
  revalidatePath(`/planning/calendar`);
  return { ok: true };
}
