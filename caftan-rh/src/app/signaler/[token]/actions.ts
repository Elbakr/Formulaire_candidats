"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { notifyRoles } from "@/lib/notify";
import { resolveEmployeeByReportToken } from "@/lib/worker-reports";

type ActionResult = { ok: true } | { ok: false; error: string };

const ALLOWED_CATEGORIES = new Set(["remarque", "anomalie", "info", "autre"]);

/**
 * Public, no-auth : le travailleur envoie un signalement à la direction depuis
 * son lien PERMANENT /signaler/[token]. Insère dans worker_reports puis notifie
 * le RH (titre précis + lien direct vers la fiche travailleur).
 *
 * Réutilisable à volonté : le même token peut envoyer autant de messages que
 * souhaité pendant tout le contrat.
 */
export async function submitWorkerReportAction(input: {
  token: string;
  category: string;
  message: string;
}): Promise<ActionResult> {
  const message = (input.message ?? "").trim();
  if (!input.token) return { ok: false, error: "Lien invalide." };
  if (message.length === 0) return { ok: false, error: "Le message est vide." };

  const admin = createAdminClient();
  const emp = await resolveEmployeeByReportToken(admin, input.token);
  if (!emp) return { ok: false, error: "Lien invalide." };

  const category = ALLOWED_CATEGORIES.has(input.category) ? input.category : "autre";

  const { error } = await admin.from("worker_reports").insert({
    employee_id: emp.id,
    category,
    message: message.slice(0, 5000),
    status: "new",
  });
  if (error) return { ok: false, error: error.message };

  // Notifie le RH (INBOUND travailleur -> nous : PAS concerné par le kill-switch outbound).
  const name = (emp.full_name ?? "").trim() || "un travailleur";
  try {
    await notifyRoles(["admin", "rh"], {
      kind: "worker_report",
      title: `Signalement de ${name}`,
      body: category !== "autre" ? `Catégorie : ${category}` : undefined,
      link: `/planning/employees/${emp.id}`,
      data: { employee_id: emp.id, category },
    });
  } catch {
    /* la notif ne doit pas faire échouer l'enregistrement du signalement */
  }

  return { ok: true };
}
