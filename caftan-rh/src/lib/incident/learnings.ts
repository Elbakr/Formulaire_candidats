// Karim 2026-06-14 : accès à la base d'apprentissage de l'agent d'astreinte
// (incrément 2a). Server-only (service-role). Voir lib/incident/qcm.ts.

import { createAdminClient } from "@/lib/supabase/server";

export type Learning = {
  signature: string;
  chosen_option: string;
  mode: string;
  created_at?: string;
  question_key?: string;
};

/** Règle active pour une signature + question (défaut = question primaire). */
export async function getActiveLearning(
  signature: string,
  questionKey = "default",
): Promise<Learning | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("agent_learnings")
    .select("signature, chosen_option, mode, created_at")
    .eq("signature", signature)
    .eq("question_key", questionKey)
    .eq("active", true)
    .maybeSingle();
  return (data as Learning | null) ?? null;
}

/** Toutes les règles actives (pour l'écran admin). */
export async function getActiveLearnings(): Promise<Learning[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("agent_learnings")
    .select("signature, chosen_option, mode, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });
  return (data ?? []) as Learning[];
}

/** Interrupteur global « Pause auto » : true => l'agent n'applique aucune règle auto. */
export async function isAutoPaused(): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_settings")
    .select("incident_auto_paused")
    .eq("id", 1)
    .maybeSingle();
  return Boolean((data as { incident_auto_paused?: boolean } | null)?.incident_auto_paused);
}

export async function setAutoPaused(paused: boolean): Promise<void> {
  const admin = createAdminClient();
  await admin.from("org_settings").update({ incident_auto_paused: paused }).eq("id", 1);
}

/** Enregistre la réponse de l'admin pour une signature + question (remplace la précédente). */
export async function recordLearning(opts: {
  signature: string;
  questionKey?: string;
  option: string;
  mode: string;
  decidedBy?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const questionKey = opts.questionKey ?? "default";
  // Désactive l'ancienne réponse active (trace conservée), puis insère la nouvelle.
  await admin
    .from("agent_learnings")
    .update({ active: false })
    .eq("signature", opts.signature)
    .eq("question_key", questionKey)
    .eq("active", true);
  await admin.from("agent_learnings").insert({
    signature: opts.signature,
    question_key: questionKey,
    chosen_option: opts.option,
    mode: opts.mode,
    decided_by: opts.decidedBy ?? null,
    active: true,
  });
}

/** Révoque la réponse active d'une signature + question. */
export async function revokeLearning(signature: string, questionKey = "default"): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("agent_learnings")
    .update({ active: false })
    .eq("signature", signature)
    .eq("question_key", questionKey)
    .eq("active", true);
}

/** Toutes les réponses actives d'une signature (toutes questions), pour l'écran. */
export async function getLearningsForSignature(signature: string): Promise<Learning[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("agent_learnings")
    .select("signature, chosen_option, mode, created_at, question_key")
    .eq("signature", signature)
    .eq("active", true);
  return (data ?? []) as Learning[];
}
