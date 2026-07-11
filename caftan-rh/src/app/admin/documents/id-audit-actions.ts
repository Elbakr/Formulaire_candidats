"use server";

// Karim 2026-07-11 : lance l'audit global des cartes d'identité et envoie UNE
// SEULE notification (in-app + push) à l'admin/RH avec le résultat global
// (validité, droit au travail, âge, documents manquants).

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyRoles } from "@/lib/notify";
import { runIdCardAudit, formatIdAuditBody } from "@/lib/id-audit";
import { extractAndUpdateAllIdCards, formatExtractBatchBody } from "@/lib/id-extract-batch";

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

// Karim 2026-07-11 : EXTRAIT les données des cartes DÉPOSÉES (PDF, IA), COMPLÈTE
// les champs manquants, SIGNALE les discordances, puis relance l'audit — le tout
// résumé dans UNE seule notification admin.
export async function extractAndAuditAction(): Promise<{ ok: boolean; summary?: string; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const batch = await extractAndUpdateAllIdCards(admin);
  const audit = await runIdCardAudit(admin); // avec les données fraîchement complétées

  const title =
    `Cartes d'identité — ${batch.filledWorkers} fiche(s) complétée(s), ` +
    `${batch.discordances.length} discordance(s) · Audit : ${audit.issues.length}/${audit.checked} à vérifier`;
  const body = `${formatExtractBatchBody(batch)}\n\n———\n\n${formatIdAuditBody(audit)}`;

  try {
    await notifyRoles(["admin", "rh"], {
      kind: "id_card_audit",
      title,
      body,
      link: "/admin/documents",
      data: {
        extraction: {
          processed: batch.processed,
          filledWorkers: batch.filledWorkers,
          filledFields: batch.filledFields,
          discordances: batch.discordances.length,
          errors: batch.errors.length,
        },
        audit: { checked: audit.checked, ok: audit.okCount, issues: audit.issues.length },
      },
    });
  } catch {
    /* la notif ne doit pas faire échouer le traitement */
  }

  const summary =
    `${batch.processed} carte(s) lue(s) · ${batch.filledWorkers} fiche(s) complétée(s) · ` +
    `${batch.discordances.length} discordance(s). Audit : ${audit.issues.length} à vérifier. Notif envoyée.`;
  return { ok: true, summary };
}
