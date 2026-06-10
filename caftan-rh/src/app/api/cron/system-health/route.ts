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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Severity = "critical" | "warning" | "info" | "ok";
type Issue = { severity: Severity; title: string; problem: string; solution: string };

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
  const hoursSince = (iso?: string | null) => (iso ? (now - new Date(iso).getTime()) / 3_600_000 : Infinity);
  const issues: Issue[] = [];

  // 1) Ingestion Tuya (pointage).
  const { data: lastTuya } = await admin
    .from("clock_entries").select("occurred_at").eq("source", "tuya")
    .order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  const tuyaAgeH = hoursSince((lastTuya as { occurred_at?: string } | null)?.occurred_at);
  if (tuyaAgeH > 12) {
    issues.push({
      severity: "critical",
      title: "Ingestion Tuya à l'arrêt",
      problem: `Aucun pointage Tuya depuis ${Math.round(tuyaAgeH)}h — les badges des employés ne sont plus enregistrés (présence et heures faussées).`,
      solution: "Vérifier que le cron tuya-poll tourne (workflow caftan-crons.yml doit être sur la branche par défaut du dépôt), puis relancer /api/cron/tuya-poll pour rattraper.",
    });
  }

  // 2) Crons figés (fraicheur du dernier sync).
  const { data: sync } = await admin
    .from("tuya_sync_state").select("last_sync_at")
    .order("last_sync_at", { ascending: false }).limit(1).maybeSingle();
  const syncAgeH = hoursSince((sync as { last_sync_at?: string } | null)?.last_sync_at);
  if (syncAgeH > 2) {
    issues.push({
      severity: "warning",
      title: "Crons possiblement à l'arrêt",
      problem: `Le dernier cycle de cron remonte à ${Math.round(syncAgeH)}h. Tout le pilote automatique (poll, sync, relances) peut être figé.`,
      solution: "Les workflows GitHub planifiés ne s'exécutent QUE depuis la branche par défaut. Mettre la branche par défaut sur celle qui contient caftan-crons.yml (ou copier le workflow sur main).",
    });
  }

  // 3) Pointages ouverts > 24h (OUT oublié).
  const { data: open } = await admin.from("clock_currently_in").select("employee_id, clock_in_at");
  const openRows = (open ?? []) as Array<{ employee_id: string; clock_in_at: string }>;
  const orphans = openRows.filter((o) => hoursSince(o.clock_in_at) > 24);
  if (orphans.length > 0) {
    issues.push({
      severity: "warning",
      title: `${orphans.length} pointage(s) ouvert(s) depuis >24h`,
      problem: `${orphans.length} employé(s) apparaissent "présents" depuis plus de 24h — un badge de sortie a été oublié.`,
      solution: "Lancer /api/cron/force-close-orphans : il ferme ces sessions avec une heure de sortie estimée (corrigeable par la RH).",
    });
  }

  // 4) Mails sortants en échec (7j).
  const { count: failedMails } = await admin
    .from("outbound_mails").select("id", { count: "exact", head: true })
    .eq("status", "failed").gte("sent_at", sevenDaysAgo);
  if ((failedMails ?? 0) > 0) {
    issues.push({
      severity: "warning",
      title: `${failedMails} mail(s) en échec (7j)`,
      problem: `${failedMails} envoi(s) d'e-mail ont échoué cette semaine — des destinataires n'ont rien reçu.`,
      solution: "Vérifier la configuration d'envoi (Resend / EmailJS / SMTP) et les logs dans /rh/mails.",
    });
  }

  // 5) Pointages anormaux à corriger (7j).
  const { count: anom } = await admin
    .from("clock_entries").select("id", { count: "exact", head: true })
    .eq("is_anomalous", true).gte("occurred_at", sevenDaysAgo);
  if ((anom ?? 0) > 0) {
    issues.push({
      severity: "info",
      title: `${anom} pointage(s) à vérifier (7j)`,
      problem: `${anom} pointage(s) marqués anormaux (jours incomplets, sessions trop longues).`,
      solution: "Les corriger depuis l'écran de présence / la fiche prestations de l'employé.",
    });
  }

  // 6) Aucun présent en pleine journée ouvrée (signal d'ingestion KO).
  const bxHour = Number(new Date().toLocaleString("en-US", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }));
  const bxDay = new Date().toLocaleString("en-US", { timeZone: "Europe/Brussels", weekday: "short" });
  const isWeekday = !["Sat", "Sun"].includes(bxDay);
  if (isWeekday && bxHour >= 10 && bxHour <= 18 && openRows.length === 0) {
    issues.push({
      severity: "warning",
      title: "Aucun présent en pleine journée",
      problem: "Personne n'est pointé alors qu'on est en horaire d'ouverture — anormal.",
      solution: "Probable arrêt de l'ingestion Tuya (voir ci-dessus) : relancer le poll et vérifier les crons.",
    });
  }

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
