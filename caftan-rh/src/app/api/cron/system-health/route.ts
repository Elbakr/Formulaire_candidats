// GET /api/cron/system-health — Karim 2026-06-10.
//
// "Agent de sante" quotidien : audite TOUT le systeme et envoie UNE seule
// notification (par admin) resumant les problemes detectes, chaque probleme
// accompagne de sa solution. La notif pointe vers sa page de detail
// (/me/notifications/[id]) qui affiche le rapport complet, + un push.
//
// Auth : Bearer CRON_SECRET. A planifier 1x/24h dans caftan-crons.yml
// (ex: 0 6 * * * -> "anomaly-scan dimona-reminder system-health").

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runHealthChecks } from "@/lib/system/health-checks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Karim 2026-06-14 : détecteurs extraits dans @/lib/system/health-checks
  // (partagés avec l'agent d'astreinte /api/cron/incident-manager).
  const issues = await runHealthChecks();

  // ----- Composition de la notification -----
  const crit = issues.filter((i) => i.severity === "critical").length;
  const warn = issues.filter((i) => i.severity === "warning").length;
  const checkedAt = new Date().toISOString();
  const title =
    crit > 0 ? `🩺 Système — ${crit} critique(s), ${warn} alerte(s)`
    : warn > 0 ? `🩺 Système — ${warn} alerte(s)`
    : "🩺 Système — tout va bien ✅";
  const body =
    issues.length > 0
      ? issues.slice(0, 5).map((i) => `• ${i.title}`).join("\n") + (issues.length > 5 ? `\n+${issues.length - 5} autre(s)` : "")
      : "Aucun problème détecté lors du dernier contrôle.";

  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const adminIds = ((admins ?? []) as Array<{ id: string }>).map((a) => a.id);

  let notified = 0;
  const { sendPushToProfile } = await import("@/lib/push-notify");
  for (const rid of adminIds) {
    const { data: ins } = await admin
      .from("notifications")
      .insert({ recipient_id: rid, kind: "system_health", title, body, data: { issues, checkedAt } })
      .select("id").single();
    if (!ins) continue;
    const link = `/me/notifications/${(ins as { id: string }).id}`;
    await admin.from("notifications").update({ link }).eq("id", (ins as { id: string }).id);
    notified++;
    try {
      await sendPushToProfile(rid, {
        title,
        body: issues.length > 0 ? `${issues.length} point(s) à examiner — clique pour le détail` : "Aucun problème détecté ✅",
        link,
        priority: crit > 0 ? "urgent" : "normal",
        tag: "system-health",
      });
    } catch { /* push best-effort */ }
  }

  return NextResponse.json({ ok: true, issues_count: issues.length, critical: crit, warning: warn, notified, issues });
}
