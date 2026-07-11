// Karim 2026-07-11 : scan quotidien des documents (titre de séjour + valise :
// Limosa, A1…) arrivant à expiration. Paliers 45 / 30 / 15 / 7 j + DATE LIMITE :
// à chaque nouveau palier franchi, NOTIFIE L'ADMIN pour qu'il VALIDE l'envoi du
// rappel au travailleur (« mets à jour pour poursuivre le travail »). AUCUN envoi
// automatique au travailleur (kill-switch respecté). Palier stocké = anti-spam.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyRoles } from "@/lib/notify";
import { scanExpiringEmployees } from "@/lib/doc-expiry-reminder";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const scan = await scanExpiringEmployees(admin);

  let notified = 0;
  for (const p of scan) {
    if (p.stage <= 0) continue;

    // Renouvellement (échéance repoussée) OU nouveau palier : on met à jour le
    // palier stocké. On ne NOTIFIE que si un NOUVEAU palier (plus urgent) est franchi.
    const crossed = p.stage > p.storedStage;
    if (p.stage !== p.storedStage) {
      try {
        await admin.from("employees").update({ residence_doc_reminder_stage: p.stage }).eq("id", p.id);
      } catch {
        /* best-effort */
      }
    }
    if (!crossed) continue;

    const label = p.minDays <= 0 ? "ÉCHÉANCE ATTEINTE" : `expire dans ${p.minDays} j`;
    try {
      await notifyRoles(["admin", "rh"], {
        kind: "doc_expiry_admin",
        title: `Documents de ${p.name ?? "un travailleur"} — ${label}`,
        body:
          `Un ou plusieurs documents (titre de séjour / valise) arrivent à expiration. ` +
          `Ouvre la fiche pour VALIDER l'envoi du rappel au travailleur (« mets à jour tes documents pour poursuivre le travail »).`,
        link: `/planning/employees/${p.id}`,
        data: { employeeId: p.id, minDays: p.minDays, stage: p.stage },
      });
      notified += 1;
    } catch {
      /* best-effort par travailleur */
    }
  }

  return NextResponse.json({ ok: true, scanned: scan.length, notified });
}
