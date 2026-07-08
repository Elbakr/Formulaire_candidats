"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { notifyRoles } from "@/lib/notify";

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

/**
 * Karim 2026-07-08 : ajout rapide d'un manquement DEPUIS le cockpit d'évaluation.
 * Consigne un écart constaté pendant l'évaluation dans worker_compliance_events
 * (kind 'evaluation', malus par défaut 1) + notifie l'équipe RH. INTERNE : jamais
 * communiqué au travailleur (Phase 1, cf. worker-compliance).
 */
export async function addEvaluationComplianceEventAction(input: {
  employeeId: string;
  title: string;
  malus?: number;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const employeeId = String(input.employeeId ?? "");
  const title = String(input.title ?? "").trim();
  if (!employeeId) return { error: "Travailleur manquant." };
  if (!title) return { error: "Décris le manquement." };
  const malus = Number.isFinite(input.malus) ? Math.max(0, Math.round(Number(input.malus))) : 1;

  const admin = createAdminClient();
  const { data: empRow } = await admin
    .from("employees")
    .select("full_name")
    .eq("id", employeeId)
    .maybeSingle();
  const fullName = (empRow as { full_name: string } | null)?.full_name ?? "Travailleur";

  const { error } = await admin.from("worker_compliance_events").insert({
    employee_id: employeeId,
    kind: "evaluation",
    title,
    malus,
    status: "open",
  });
  if (error) return { error: error.message };

  try {
    await notifyRoles(["admin", "rh"], {
      kind: "compliance_event",
      title: `Manquement consigné — ${fullName}`,
      body: `${title} (malus ${malus})`,
      link: `/planning/employees/${employeeId}#compliance`,
    });
  } catch {
    /* non bloquant : le manquement est déjà enregistré */
  }

  revalidatePath(`/scoring/evaluate/${employeeId}`);
  revalidatePath(`/planning/employees/${employeeId}`);
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
