"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireProfile } from "@/lib/auth";
import { startOfWeek, parseISODate, addDays, toISODate } from "@/lib/planning";
import {
  detectRushWeek,
  type RushHoliday,
  type RushSeasonalEvent,
} from "@/lib/validation/rush-detection";

export type ValidationRunRow = {
  id: string;
  week_iso: string;
  site_id: string | null;
  created_by: string | null;
  created_at: string;
  deadline_at: string | null;
  obligation_reason: string | null;
  was_mandatory: boolean;
  was_bypassed: boolean;
  bypass_reason: string | null;
  status: "pending" | "closed" | "cancelled";
};

export type ValidationResponseRow = {
  id: string;
  run_id: string;
  employee_id: string;
  validated_at: string | null;
  refused_at: string | null;
  response: "accepted" | "refused" | "no_response" | null;
  notes: string | null;
  cancelled_after_validation: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

/** Cree un run de validation pour une semaine. Si la semaine est en rush, le
 *  champ was_mandatory est mis a true automatiquement.
 */
export async function createValidationRunAction(args: {
  weekISO: string;
  siteId?: string | null;
  deadlineAt?: string | null;
  bypassMandatory?: boolean;
  bypassReason?: string;
}): Promise<{ ok?: boolean; runId?: string; error?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const monday = startOfWeek(parseISODate(args.weekISO));
  const weekISO = toISODate(monday);
  const weekEndISO = toISODate(addDays(monday, 6));

  // Detection rush automatique
  const [{ data: holidaysRaw }, { data: seasonalRaw }] = await Promise.all([
    supabase
      .from("holidays")
      .select("date, priority, kind, shops_closed, staff_multiplier")
      .gte("date", weekISO)
      .lte("date", weekEndISO),
    supabase
      .from("seasonal_events")
      .select("id, kind, start_date, end_date, label")
      .lte("start_date", weekEndISO)
      .gte("end_date", weekISO),
  ]);

  const rush = detectRushWeek(
    weekISO,
    (holidaysRaw ?? []) as RushHoliday[],
    (seasonalRaw ?? []) as RushSeasonalEvent[],
  );

  const wasMandatory = rush.isRush;
  const wasBypassed = wasMandatory && (args.bypassMandatory === true);
  const obligationReason = rush.isRush ? rush.reasons.join(" | ") : null;

  const { data: ins, error } = await supabase
    .from("planning_validation_runs")
    .insert({
      week_iso: weekISO,
      site_id: args.siteId ?? null,
      created_by: profile.id,
      deadline_at: args.deadlineAt ?? null,
      obligation_reason: obligationReason,
      was_mandatory: wasMandatory,
      was_bypassed: wasBypassed,
      bypass_reason: wasBypassed ? (args.bypassReason ?? null) : null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/planning/validation");
  revalidatePath("/me/planning");
  return { ok: true, runId: (ins as { id: string }).id };
}

/** Cloture un run (manuel ou auto). */
export async function closeValidationRunAction(
  runId: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("planning_validation_runs")
    .update({ status: "closed" })
    .eq("id", runId);
  if (error) return { error: error.message };
  revalidatePath("/planning/validation");
  return { ok: true };
}

/** L employe valide (ou refuse) son planning pour le run donne. */
export async function submitValidationResponseAction(args: {
  runId: string;
  employeeId: string;
  response: "accepted" | "refused";
  notes?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const now = new Date().toISOString();

  const payload = {
    run_id: args.runId,
    employee_id: args.employeeId,
    validated_at: args.response === "accepted" ? now : null,
    refused_at: args.response === "refused" ? now : null,
    response: args.response,
    notes: args.notes ?? null,
  };

  // Upsert sur (run_id, employee_id) -- unique constraint.
  const { error } = await supabase
    .from("planning_validation_responses")
    .upsert(payload, { onConflict: "run_id,employee_id" });
  if (error) return { error: error.message };

  revalidatePath("/planning/validation");
  revalidatePath("/me/planning");
  return { ok: true };
}

/** L employe annule sa validation (ex. il ne pourra finalement pas tenir son
 * shift). Karim 15/05 : cela penalise son score (scoring penalty calcule
 * ailleurs via cancelled_after_validation=true).
 */
export async function cancelAfterValidationAction(args: {
  runId: string;
  employeeId: string;
  reason: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireProfile();
  if (!args.reason || args.reason.trim().length < 3) {
    return { error: "Raison requise (min 3 caracteres)." };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from("planning_validation_responses")
    .update({
      cancelled_after_validation: true,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: args.reason.trim(),
    })
    .eq("run_id", args.runId)
    .eq("employee_id", args.employeeId);
  if (error) return { error: error.message };
  revalidatePath("/planning/validation");
  revalidatePath("/me/planning");
  return { ok: true };
}
