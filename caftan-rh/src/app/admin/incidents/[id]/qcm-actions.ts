"use server";

// Actions de l'écran QCM incident (incrément 2a). Toutes gardées admin.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { recordLearning, revokeLearning, setAutoPaused } from "@/lib/incident/learnings";
import { isValidAnswer, modeForAnswer } from "@/lib/incident/qcm";
import { runPlaybook } from "@/lib/incident/playbooks";
import { interpretCommand, executeAction, type CommandAction } from "@/lib/incident/nl-command";
import type { Issue } from "@/lib/system/health-checks";

type ActionResult = { ok: boolean; error?: string; message?: string };

export type NlResult = {
  ok: boolean;
  mode: "executed" | "confirm" | "clarify";
  message: string;
  proposal?: { action: string; params: Record<string, unknown>; reason: string };
};

/** Audit best-effort d'une commande NL dans agent_actions (n'échoue jamais l'action). */
async function auditNl(
  admin: ReturnType<typeof createAdminClient>,
  payload: Record<string, unknown>,
  status: string,
  decidedBy: string | null,
): Promise<void> {
  try {
    await admin.from("agent_actions").insert({
      kind: "nl_command",
      status,
      payload,
      proposed_by_agent: "nl-command",
      decided_by: decidedBy,
    });
  } catch {
    /* table/colonnes absentes -> on ignore, l'action a déjà eu lieu */
  }
}

/** Barre de commande : interprète l'instruction, exécute le sûr, propose le sensible. */
export async function nlCommandAction(text: string, incidentId: string): Promise<NlResult> {
  const { profile } = await requireRole(["admin"]);
  const clean = (text ?? "").trim();
  if (!clean) return { ok: false, mode: "clarify", message: "Écris une instruction." };

  const admin = createAdminClient();
  const { data: inc } = await admin.from("incidents").select("signature").eq("id", incidentId).maybeSingle();
  const signature = (inc as { signature?: string } | null)?.signature;

  const interp = await interpretCommand(clean, { incidentId, signature });

  if (!interp.ok || interp.action === "none" || interp.confidence < 0.45) {
    await auditNl(admin, { text: clean, interp }, "clarify", profile.id);
    return { ok: true, mode: "clarify", message: interp.reason || "Je n'ai pas compris l'instruction — peux-tu préciser ?" };
  }

  if (interp.sensitivity === "sensitive") {
    await auditNl(admin, { text: clean, interp }, "proposed", profile.id);
    return {
      ok: true,
      mode: "confirm",
      message: `Action sensible détectée. ${interp.reason}`.trim(),
      proposal: { action: interp.action, params: interp.params, reason: interp.reason },
    };
  }

  const res = await executeAction(interp.action, interp.params, { incidentId, signature });
  await auditNl(admin, { text: clean, interp, result: res }, res.ok ? "executed" : "failed", profile.id);
  revalidatePath(`/admin/incidents/${incidentId}`);
  return { ok: res.ok, mode: "executed", message: `${interp.reason ? interp.reason + " — " : ""}${res.message}` };
}

/** Confirme et exécute une action sensible précédemment proposée. */
export async function confirmNlAction(action: string, paramsJson: string, incidentId: string): Promise<ActionResult> {
  const { profile } = await requireRole(["admin"]);
  let params: Record<string, unknown> = {};
  try { params = JSON.parse(paramsJson) as Record<string, unknown>; } catch { /* {} */ }
  const admin = createAdminClient();
  const { data: inc } = await admin.from("incidents").select("signature").eq("id", incidentId).maybeSingle();
  const signature = (inc as { signature?: string } | null)?.signature;
  const res = await executeAction(action as CommandAction, params, { incidentId, signature });
  await auditNl(admin, { confirmed: action, params, result: res }, res.ok ? "executed" : "failed", profile.id);
  revalidatePath(`/admin/incidents/${incidentId}`);
  return { ok: res.ok, message: res.message, error: res.ok ? undefined : res.message };
}

/** L'admin répond à UNE question du QCM : enregistre la réponse + effet immédiat
 *  (seulement pour la question primaire "default" qui pilote l'agent). */
export async function answerQcmAction(
  incidentId: string,
  questionId: string,
  optionKey: string,
): Promise<ActionResult> {
  const { profile } = await requireRole(["admin"]);

  const admin = createAdminClient();
  const { data: inc } = await admin
    .from("incidents")
    .select("id, signature, status, severity, title, problem")
    .eq("id", incidentId)
    .maybeSingle();
  if (!inc) return { ok: false, error: "Incident introuvable." };
  const incident = inc as { id: string; signature: string; severity: string; title: string; problem: string };

  if (!isValidAnswer(incident.signature, questionId, optionKey)) {
    return { ok: false, error: "Réponse invalide pour cette question." };
  }

  // 1) Mémorise la réponse pour cette question (remplace l'éventuelle précédente).
  await recordLearning({
    signature: incident.signature,
    questionKey: questionId,
    option: optionKey,
    mode: modeForAnswer(incident.signature, questionId, optionKey),
    decidedBy: profile.id,
  });

  // 2) Effet immédiat UNIQUEMENT pour la question primaire (pilote l'agent).
  if (questionId !== "default") {
    revalidatePath(`/admin/incidents/${incidentId}`);
    return { ok: true, message: "Réponse enregistrée — merci, ça affine l'apprentissage." };
  }

  const nowIso = new Date().toISOString();
  let message = "Consigne enregistrée.";

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

/** Révoque la réponse apprise d'une signature + question (retour au défaut). */
export async function revokeRuleAction(
  signature: string,
  questionId: string,
  incidentId: string,
): Promise<ActionResult> {
  await requireRole(["admin"]);
  await revokeLearning(signature, questionId);
  revalidatePath(`/admin/incidents/${incidentId}`);
  return { ok: true, message: "Réponse révoquée — retour au comportement par défaut." };
}

/** Active/désactive l'interrupteur global « Pause auto ». */
export async function togglePauseAction(paused: boolean, incidentId: string): Promise<ActionResult> {
  await requireRole(["admin"]);
  await setAutoPaused(paused);
  revalidatePath(`/admin/incidents/${incidentId}`);
  return { ok: true, message: paused ? "Pause auto ACTIVÉE — l'agent n'agit plus seul." : "Pause auto désactivée — règles auto réactivées." };
}
