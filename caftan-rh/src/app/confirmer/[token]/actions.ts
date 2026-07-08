"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { notifyRoles } from "@/lib/notify";
import { resolveEmployeeByReportToken } from "@/lib/worker-reports";
import { GUIDE_DOCUMENT_KEY } from "@/lib/worker-compliance";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Public, no-auth : le travailleur confirme (lu/compris/assimilé/accepté) le
 * guide de conduite depuis son lien PERMANENT /confirmer/[token]. Service-role.
 *
 * Upsert worker_document_acks (les 4 bools à true + confirmed_at=now) puis
 * notifie le RH. Réutilisable : peut re-confirmer sans erreur.
 */
export async function confirmGuideAckAction(input: { token: string }): Promise<ActionResult> {
  if (!input.token) return { ok: false, error: "Lien invalide." };

  const admin = createAdminClient();
  const emp = await resolveEmployeeByReportToken(admin, input.token);
  if (!emp) return { ok: false, error: "Lien invalide." };

  const now = new Date().toISOString();
  const { error } = await admin.from("worker_document_acks").upsert(
    {
      employee_id: emp.id,
      document_key: GUIDE_DOCUMENT_KEY,
      read_ok: true,
      understood_ok: true,
      assimilated_ok: true,
      accepted_ok: true,
      confirmed_at: now,
    },
    { onConflict: "employee_id,document_key" },
  );
  if (error) return { ok: false, error: error.message };

  const name = (emp.full_name ?? "").trim() || "un travailleur";
  try {
    await notifyRoles(["admin", "rh"], {
      kind: "guide_ack_confirmed",
      title: `${name} a confirmé le guide conduite`,
      body: "Lu / compris / assimilé / accepté.",
      link: `/planning/employees/${emp.id}`,
      data: { employee_id: emp.id, document_key: GUIDE_DOCUMENT_KEY },
    });
  } catch {
    /* la notif ne doit pas faire échouer l'accusé de réception */
  }

  return { ok: true };
}
