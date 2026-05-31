"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function validateScreeningAction(responseId: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { error } = await admin
    .from("screening_responses")
    .update({ rh_decision_at: new Date().toISOString() })
    .eq("id", responseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/rh/screening/${responseId}`);
  revalidatePath("/rh/screening");
  return { ok: true };
}
