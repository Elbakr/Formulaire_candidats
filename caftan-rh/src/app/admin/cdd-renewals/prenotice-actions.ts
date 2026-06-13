"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { sendRenewalPreNotice } from "@/lib/cdd-renewal-notice";

export async function sendPreNoticeAction(responseId: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data: rowRaw } = await admin
    .from("cdd_renewal_responses")
    .select("id, employee_id, contract_end_date, token")
    .eq("id", responseId)
    .maybeSingle();
  const row = rowRaw as { id: string; employee_id: string; contract_end_date: string; token: string } | null;
  if (!row) return { ok: false, error: "Pré-avis introuvable." };
  const r = await sendRenewalPreNotice(admin as unknown as Parameters<typeof sendRenewalPreNotice>[0], row);
  if (r.ok) revalidatePath("/admin/cdd-renewals");
  return r;
}
