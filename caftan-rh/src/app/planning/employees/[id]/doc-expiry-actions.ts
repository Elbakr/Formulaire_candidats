"use server";

// Karim 2026-07-11 : envoi MANUEL (validé par l'admin) du rappel d'expiration du
// titre de séjour / CI au travailleur. Jamais automatique.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { sendDocExpiryReminder } from "@/lib/doc-expiry-reminder";

export async function sendDocExpiryReminderAction(
  employeeId: string,
): Promise<{ ok: boolean; error?: string; to?: string }> {
  await requireRole(["admin", "rh"]);
  if (!employeeId) return { ok: false, error: "Travailleur manquant." };
  const admin = createAdminClient();
  const r = await sendDocExpiryReminder(admin, employeeId);
  if (r.ok) revalidatePath(`/planning/employees/${employeeId}`);
  return r;
}
