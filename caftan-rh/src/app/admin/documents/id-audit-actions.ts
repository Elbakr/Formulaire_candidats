"use server";

// Karim 2026-07-11 : lance l'audit global des cartes d'identité et envoie UNE
// SEULE notification (in-app + push) à l'admin/RH avec le résultat global
// (validité, droit au travail, âge, documents manquants).

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyRoles } from "@/lib/notify";
import { runIdCardAudit, formatIdAuditBody } from "@/lib/id-audit";

export async function runIdCardAuditAction(): Promise<{ ok: boolean; summary?: string; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const res = await runIdCardAudit(admin);

  const title =
    res.issues.length > 0
      ? `Contrôle cartes d'identité — ${res.issues.length} à vérifier / ${res.checked}`
      : `Contrôle cartes d'identité — tout est OK (${res.checked})`;

  try {
    await notifyRoles(["admin", "rh"], {
      kind: "id_card_audit",
      title,
      body: formatIdAuditBody(res),
      link: "/admin/documents",
      data: { counts: res.counts, checked: res.checked, ok: res.okCount },
    });
  } catch {
    /* la notif ne doit pas faire échouer l'audit */
  }

  const summary = `${res.checked} contrôlés · ${res.okCount} OK · ${res.issues.length} à vérifier. Notification envoyée.`;
  return { ok: true, summary };
}
