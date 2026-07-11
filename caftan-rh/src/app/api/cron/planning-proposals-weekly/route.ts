// GET /api/cron/planning-proposals-weekly
//
// Karim 2026-07-11 : GÉNÉRATION PROGRAMMÉE (Phase 2). Régénère la proposition de
// planning (variantes A→L, 100 % du quota, séquentielles, conformes) de TOUS les
// employés actifs EN UNE FOIS — pas fiche par fiche. Conserve la variante par
// défaut déjà choisie. Interne uniquement : AUCUN envoi au travailleur ; une seule
// notif RÉCAP à l'admin/rh (objet + lien vers la liste).
//
// Cadence recommandée : hebdomadaire (lundi tôt le matin, Europe/Brussels).
// Auth : Bearer CRON_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { regenerateAllPlanningProposals } from "@/lib/scheduling/planning-proposal-store";
import { sendPushToProfiles } from "@/lib/push-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Kill-switch admin (org_settings) : l'admin peut désactiver ce cron à tout
  // moment. Le bouton manuel « Générer plannings (tous) » reste, lui, disponible.
  const { data: org } = await admin
    .from("org_settings")
    .select("planning_weekly_autogen_enabled")
    .eq("id", 1)
    .maybeSingle();
  const enabled = (org as { planning_weekly_autogen_enabled: boolean | null } | null)
    ?.planning_weekly_autogen_enabled;
  if (enabled === false) {
    return NextResponse.json({ ok: true, disabled: true, reason: "Cron désactivé par l'admin (réglages)." });
  }

  const today = new Date().toISOString().slice(0, 10); // le moteur cale sur le lundi

  const summary = await regenerateAllPlanningProposals(admin, {
    startDate: today,
    generatedBy: "cron/planning-proposals-weekly",
    scheduleRecurrence: "weekly",
  });

  // Notif RÉCAP interne (admin + rh) — objet précis + lien direct vers la liste.
  const { data: rhRows } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
  const rhIds = ((rhRows ?? []) as Array<{ id: string }>).map((p) => p.id);

  const alertCount = summary.alerts.length;
  const failCount = summary.failed.length;
  const bodyLines = [
    `${summary.ok}/${summary.total} planning(s) (re)généré(s).`,
    alertCount ? `⚠️ ${alertCount} en alerte (quota/conformité).` : "",
    failCount ? `❌ ${failCount} en échec.` : "",
  ].filter(Boolean);
  const body = bodyLines.join(" ");

  if (rhIds.length > 0) {
    const notifInserts = rhIds.map((rhId) => ({
      recipient_id: rhId,
      kind: "planning_proposals_weekly",
      title: `Génération hebdomadaire des plannings — ${summary.ok}/${summary.total}`,
      body,
      link: "/planning/employees",
      data: {
        ok: summary.ok,
        total: summary.total,
        alerts: summary.alerts.slice(0, 20),
        failed: summary.failed.slice(0, 20),
      },
    }));
    try {
      await admin.from("notifications").insert(notifInserts);
    } catch {
      /* non bloquant */
    }
    try {
      await sendPushToProfiles(rhIds, {
        title: "Plannings hebdomadaires générés",
        body,
        link: "/planning/employees",
        priority: "normal",
        tag: `planning-proposals-weekly-${today}`,
      });
    } catch {
      /* push non bloquant */
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
