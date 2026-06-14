"use server";

// Actions de l'écran QCM incident (incrément 2a). Toutes gardées admin.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { recordLearning, revokeLearning, setAutoPaused } from "@/lib/incident/learnings";
import { isValidBehavior, modeForBehavior } from "@/lib/incident/qcm";
import { runPlaybook } from "@/lib/incident/playbooks";
import type { Issue } from "@/lib/system/health-checks";

type ActionResult = { ok: boolean; error?: string; message?: string };

/** L'admin répond au QCM : enregistre la consigne + applique l'effet immédiat. */
export async function answerQcmAction(
  incidentId: string,
  optionKey: string,
): Promise<ActionResult> {
  const { profile } = await requireRole(["admin"]);
  if (!isValidBehavior(optionKey)) return { ok: false, error: "Option invalide." };

  const admin = createAdminClient();
  const { data: inc } = await admin
    .from("incidents")
    .select("id, signature, status, severity, title, problem")
    .eq("id", incidentId)
    .maybeSingle();
  if (!inc) return { ok: false, error: "Incident introuvable." };
  const incident = inc as { id: string; signature: string; severity: string; title: string; problem: string };

  // 1) Mémorise la consigne (remplace l'éventuelle règle précédente).
  await recordLearning({
    signature: incident.signature,
    option: optionKey,
    mode: modeForBehavior(optionKey),
    decidedBy: profile.id,
  });

  const nowIso = new Date().toISOString();
  let message = "Consigne enregistrée.";

  // 2) Effet immédiat sur CET incident.
  if (optionKey === "ignore_auto") {
    await admin.from("incidents").update({
      status: "resolved",
      resolved_at: nowIso,
      repair_model: "learned:ignore",
      resolution: {
        cause: incident.problem,
        solution: "Mis en sourdine sur ta consigne (règle apprise).",
        prevention: "Ce type d'alerte sera désormais géré en silence — révocable à tout moment.",
      },
    }).eq("id", incident.id);
    message = "Cet incident est clos et ce type d'alerte sera géré en silence à l'avenir.";
  } else if (optionKey === "auto_fix") {
    // Lance la réparation tout de suite.
    const issue = {
      key: incident.signature,
      severity: incident.severity,
      title: incident.title,
      problem: incident.problem,
      solution: "",
    } as unknown as Issue;
    const outcome = await runPlaybook(issue);
    if (outcome?.fixed) {
      await admin.from("incidents").update({
        status: "resolved",
        resolved_at: nowIso,
        repair_model: outcome.model,
        resolution: { cause: outcome.cause, solution: outcome.solution, prevention: outcome.prevention },
      }).eq("id", incident.id);
      message = "Réparé tout de suite, et je réparerai automatiquement à l'avenir.";
    } else {
      message = outcome
        ? "La réparation auto n'a pas suffi cette fois ; je réessaierai automatiquement aux prochaines occurrences."
        : "Pas de réparation automatique disponible pour ce type — consigne enregistrée.";
    }
  } else {
    message = "OK, je continuerai à te notifier pour ce type de panne.";
  }

  revalidatePath(`/admin/incidents/${incidentId}`);
  return { ok: true, message };
}

/** Révoque la règle apprise d'une signature (retour au comportement par défaut). */
export async function revokeRuleAction(signature: string, incidentId: string): Promise<ActionResult> {
  await requireRole(["admin"]);
  await revokeLearning(signature);
  revalidatePath(`/admin/incidents/${incidentId}`);
  return { ok: true, message: "Règle révoquée — retour au comportement par défaut (notification)." };
}

/** Active/désactive l'interrupteur global « Pause auto ». */
export async function togglePauseAction(paused: boolean, incidentId: string): Promise<ActionResult> {
  await requireRole(["admin"]);
  await setAutoPaused(paused);
  revalidatePath(`/admin/incidents/${incidentId}`);
  return { ok: true, message: paused ? "Pause auto ACTIVÉE — l'agent n'agit plus seul." : "Pause auto désactivée — règles auto réactivées." };
}
