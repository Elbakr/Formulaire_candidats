"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function setLegalRuleEnabledAction(ruleId: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin"]);
  const admin = createAdminClient();
  const { error } = await admin.from("legal_rules").update({ enabled }).eq("id", ruleId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/legal-rules");
  return { ok: true };
}
