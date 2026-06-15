"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import type { PreInterviewDecision } from "@/lib/pre-interview-types";

/**
 * Relancer un candidat depuis le vivier : crée un nouveau pré-entretien ou
 * met à jour la décision vers "shortlist".
 */
export async function relancerVivierAction(
  preInterviewId: string,
  applicationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  // Passe la décision à "shortlist" pour que le trigger flip le statut candidature
  const { error } = await supabase
    .from("pre_interviews")
    .update({
      decision: "shortlist" as PreInterviewDecision,
      reviewer_id: profile.id,
      reviewed_at: new Date().toISOString(),
      decision_note: "Relancé depuis le vivier",
    })
    .eq("id", preInterviewId);

  if (error) return { ok: false, error: error.message };

  await logActivity({
    kind: "pre_interview.decision",
    targetType: "application",
    targetId: applicationId,
    description: "Relancé depuis le vivier (shortlist)",
    data: { pre_interview_id: preInterviewId, decision: "shortlist", from: "vivier" },
    actorId: profile.id,
    actorLabel: profile.full_name ?? null,
  });

  revalidatePath("/admin/candidates/reserve");
  revalidatePath(`/rh/candidates/${applicationId}`);
  revalidatePath("/admin/pre-interview");
  return { ok: true };
}

/**
 * Rejeter définitivement un candidat depuis le vivier.
 */
export async function rejeterVivierAction(
  preInterviewId: string,
  applicationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const { error: piErr } = await supabase
    .from("pre_interviews")
    .update({
      decision: "reject" as PreInterviewDecision,
      reviewer_id: profile.id,
      reviewed_at: new Date().toISOString(),
      decision_note: "Rejeté depuis le vivier",
    })
    .eq("id", preInterviewId);

  if (piErr) return { ok: false, error: piErr.message };

  // Marque la candidature comme refusée
  const { error: appErr } = await supabase
    .from("applications")
    .update({ status: "refused" })
    .eq("id", applicationId);

  if (appErr) return { ok: false, error: appErr.message };

  await logActivity({
    kind: "pre_interview.decision",
    targetType: "application",
    targetId: applicationId,
    description: "Rejeté depuis le vivier",
    data: { pre_interview_id: preInterviewId, decision: "reject", from: "vivier" },
    actorId: profile.id,
    actorLabel: profile.full_name ?? null,
  });

  revalidatePath("/admin/candidates/reserve");
  revalidatePath(`/rh/candidates/${applicationId}`);
  revalidatePath("/admin/pre-interview");
  return { ok: true };
}
