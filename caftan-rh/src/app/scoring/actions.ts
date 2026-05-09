"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function recomputeMetricsAction() {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("recompute_all_employee_metrics");
  if (error) return { error: error.message };
  revalidatePath("/scoring");
  return { ok: true, count: data as number };
}

export async function createEvaluationAction(formData: FormData) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const employeeId = String(formData.get("employee_id") ?? "");
  const periodStart = String(formData.get("period_start") ?? "");
  const periodEnd = String(formData.get("period_end") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || null;

  // 7 axes Discovery (recrutement.html EVAL_CRIT)
  const scores: Record<string, number> = {};
  for (const k of [
    "ponctualite",
    "presentation",
    "communication",
    "motivation",
    "experience",
    "polyvalence",
    "disponibilite",
  ]) {
    const v = Number(formData.get(`score_${k}`) ?? 0);
    if (v < 1 || v > 5) return { error: `Note ${k} invalide (1-5).` };
    scores[k] = v;
  }
  if (!employeeId || !periodStart || !periodEnd) return { error: "Données manquantes." };

  const supabase = await createClient();
  const { error } = await supabase.from("evaluations").insert({
    employee_id: employeeId,
    evaluator_id: profile.id,
    period_start: periodStart,
    period_end: periodEnd,
    scores,
    comment,
  });
  if (error) return { error: error.message };
  revalidatePath("/scoring");
  revalidatePath(`/scoring/${employeeId}`);
  return { ok: true };
}

export async function deleteEvaluationAction(id: string, employeeId: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("evaluations").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/scoring/${employeeId}`);
  revalidatePath("/scoring");
  return { ok: true };
}
