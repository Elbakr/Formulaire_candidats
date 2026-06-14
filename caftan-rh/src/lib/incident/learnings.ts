// Karim 2026-06-14 : accès à la base d'apprentissage de l'agent d'astreinte
// (incrément 2a). Server-only (service-role). Voir lib/incident/qcm.ts.

import { createAdminClient } from "@/lib/supabase/server";

export type Learning = {
  signature: string;
  chosen_option: string;
  mode: string;
  created_at?: string;
};

/** Règle active pour une signature (ou null). */
export async function getActiveLearning(signature: string): Promise<Learning | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("agent_learnings")
    .select("signature, chosen_option, mode, created_at")
    .eq("signature", signature)
    .eq("question_key", "default")
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

/** Enregistre la consigne de l'admin pour une signature (remplace la précédente). */
export async function recordLearning(opts: {
  signature: string;
  option: string;
  mode: string;
  decidedBy?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  // Désactive l'ancienne règle active (trace conservée), puis insère la nouvelle.
  await admin
    .from("agent_learnings")
    .update({ active: false })
    .eq("signature", opts.signature)
    .eq("question_key", "default")
    .eq("active", true);
  await admin.from("agent_learnings").insert({
    signature: opts.signature,
    question_key: "default",
    chosen_option: opts.option,
    mode: opts.mode,
    decided_by: opts.decidedBy ?? null,
    active: true,
  });
}

/** Révoque la règle active d'une signature (retour au comportement par défaut). */
export async function revokeLearning(signature: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("agent_learnings")
    .update({ active: false })
    .eq("signature", signature)
    .eq("question_key", "default")
    .eq("active", true);
}
