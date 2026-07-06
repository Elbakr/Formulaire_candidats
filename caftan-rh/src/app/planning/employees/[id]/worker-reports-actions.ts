"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Marque un signalement comme traité ('handled'). RH/admin uniquement. */
export async function markWorkerReportHandledAction(input: {
  reportId: string;
  employeeId: string;
}): Promise<ActionResult> {
  await requireRole(["admin", "rh", "manager"]);
  if (!input.reportId) return { ok: false, error: "Signalement manquant." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("worker_reports")
    .update({ status: "handled" })
    .eq("id", input.reportId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/planning/employees/${input.employeeId}`);
  return { ok: true };
}
