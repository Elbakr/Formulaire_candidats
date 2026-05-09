"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { runDigest, type DigestSlot } from "@/lib/digest/run";

export type TriggerManualDigestResult =
  | {
      ok: true;
      digest_run_id?: string;
      slot: DigestSlot;
      ai_used: boolean;
      ai_error?: string;
      recipients_count?: number;
      email_sent?: boolean;
    }
  | { ok: false; error: string };

export async function triggerManualDigestAction(
  slot: DigestSlot,
): Promise<TriggerManualDigestResult> {
  const { profile } = await requireRole(["admin", "rh"]);
  try {
    const r = await runDigest({ slot, callerProfileId: profile.id });
    revalidatePath("/admin/digest");
    if (!r.ok) return { ok: false, error: r.ai_error ?? "Échec digest." };
    return {
      ok: true,
      digest_run_id: r.digest_run_id,
      slot: r.slot,
      ai_used: r.ai_used,
      ai_error: r.ai_error,
      recipients_count: r.recipients_count,
      email_sent: r.email_sent,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Erreur inconnue." };
  }
}
