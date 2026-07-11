// Karim 2026-07-11 : scan quotidien des titres de séjour / CI arrivant à
// expiration. 45 j avant l'échéance (pendant le contrat), NOTIFIE L'ADMIN pour
// qu'il VALIDE l'envoi du rappel au travailleur (bouton 1-clic sur la fiche).
// AUCUN envoi automatique au travailleur ici (kill-switch respecté).
// Anti-spam : 1 notif admin par travailleur / 30 jours.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyRoles } from "@/lib/notify";
import { findExpiringWorkers, daysUntil, DOC_EXPIRY_WINDOW_DAYS } from "@/lib/doc-expiry-reminder";

export const dynamic = "force-dynamic";

const DEDUP_DAYS = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const workers = await findExpiringWorkers(admin, DOC_EXPIRY_WINDOW_DAYS);

  const cutoff = new Date(Date.now() - DEDUP_DAYS * 86_400_000).toISOString();
  let notified = 0;
  for (const w of workers) {
    // Déjà envoyé au travailleur ? -> plus besoin de solliciter l'admin.
    if (w.residence_doc_reminder_at) continue;

    const link = `/planning/employees/${w.id}`;
    // Dédup : notif admin déjà émise pour CE travailleur dans les 30 derniers jours ?
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("kind", "doc_expiry_admin")
      .eq("link", link)
      .gte("created_at", cutoff)
      .limit(1)
      .maybeSingle();
    if (recent) continue;

    const d = daysUntil(w.residence_doc_expiry);
    try {
      await notifyRoles(["admin", "rh"], {
        kind: "doc_expiry_admin",
        title: `Titre de séjour / CI de ${w.full_name ?? "un travailleur"} expire dans ${d} j`,
        body: `Échéance le ${w.residence_doc_expiry}. Ouvre la fiche pour VALIDER l'envoi du rappel au travailleur (renouvellement + copie du nouveau document).`,
        link,
        data: { employeeId: w.id, expiry: w.residence_doc_expiry, days: d, docType: w.residence_doc_type },
      });
      notified += 1;
    } catch {
      /* best-effort par travailleur */
    }
  }

  return NextResponse.json({ ok: true, expiringWithin: DOC_EXPIRY_WINDOW_DAYS, found: workers.length, notified });
}
