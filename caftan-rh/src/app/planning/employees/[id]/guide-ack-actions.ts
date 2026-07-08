"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { sendGuideAckRequest } from "@/lib/worker-compliance";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Envoi MANUEL 1-clic RH : envoie au travailleur le lien pour lire + confirmer le
 * guide de conduite. Assure le token durable, pose sent_at, envoie le mail.
 */
export async function sendGuideAckAction(input: { employeeId: string }): Promise<ActionResult> {
  await requireRole(["admin", "rh"]);
  if (!input.employeeId) return { ok: false, error: "Travailleur manquant." };

  const admin = createAdminClient();
  const res = await sendGuideAckRequest(admin, input.employeeId);
  if (!res.ok) return { ok: false, error: res.error ?? "Envoi impossible." };

  revalidatePath(`/planning/employees/${input.employeeId}`);
  return { ok: true };
}

/** Résout (clôt) un manquement : status='resolved', resolved_at=now. RH/admin. */
export async function resolveComplianceEventAction(input: {
  eventId: string;
  employeeId: string;
}): Promise<ActionResult> {
  await requireRole(["admin", "rh"]);
  if (!input.eventId) return { ok: false, error: "Manquement manquant." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("worker_compliance_events")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", input.eventId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/planning/employees/${input.employeeId}`);
  return { ok: true };
}
