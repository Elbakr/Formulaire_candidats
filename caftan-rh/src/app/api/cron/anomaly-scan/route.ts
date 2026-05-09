// GET /api/cron/anomaly-scan — quotidien (vercel cron, 06:00 UTC).
//
// Lance tous les détecteurs définis dans `@/lib/anomaly/detect`, et insère
// dans `anomaly_flags` ceux qui ne sont pas déjà ouverts (kind+target_id non
// résolu, détecté il y a moins de 7 jours). Notifie les RH/admins en cas de
// sévérité 'critical' (1 notification par recipient, agrégée).
//
// Auth : Bearer CRON_SECRET. Idempotent.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runAllDetectors, type AnomalyCandidate } from "@/lib/anomaly/detect";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const DEDUPE_WINDOW_DAYS = 7;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  let candidates: AnomalyCandidate[] = [];
  try {
    candidates = await runAllDetectors(admin);
  } catch (e) {
    console.error("[anomaly-scan] detector error:", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  // Build a dedupe lookup : open flags or recently-resolved (< 7d) flags
  // for the same kind + target_id. We don't want to spam if RH already saw it.
  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: existingRaw } = await admin
    .from("anomaly_flags")
    .select("kind, target_type, target_id, detected_at, resolved_at")
    .gte("detected_at", cutoff);

  type ExistingRow = {
    kind: string;
    target_type: string;
    target_id: string | null;
    detected_at: string;
    resolved_at: string | null;
  };
  const existingKeys = new Set<string>();
  for (const row of (existingRaw ?? []) as ExistingRow[]) {
    // dedupe is on kind + target. Ouvertes : toujours bloquantes.
    // Résolues : seulement si la résolution date d'il y a moins de DEDUPE_WINDOW_DAYS,
    // ce qui est garanti par le filtre `detected_at >= cutoff` ci-dessus.
    existingKeys.add(`${row.kind}|${row.target_type}|${row.target_id ?? ""}`);
  }

  const fresh = candidates.filter(
    (c) => !existingKeys.has(`${c.kind}|${c.target_type}|${c.target_id ?? ""}`),
  );

  let inserted = 0;
  const criticalsByTargetType: AnomalyCandidate[] = [];
  if (fresh.length > 0) {
    const rows = fresh.map((c) => ({
      kind: c.kind,
      severity: c.severity,
      target_type: c.target_type,
      target_id: c.target_id,
      title: c.title,
      description: c.description,
      data: c.data ?? null,
    }));
    const { data: insertedRows, error: insErr } = await admin
      .from("anomaly_flags")
      .insert(rows)
      .select("id, kind, severity, target_id, title");
    if (insErr) {
      console.error("[anomaly-scan] insert failed:", insErr.message);
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
    inserted = insertedRows?.length ?? 0;
    for (const c of fresh) {
      if (c.severity === "critical") criticalsByTargetType.push(c);
    }
  }

  // Notify managers/RH about critical anomalies (one rolled-up notification per recipient)
  let notifs = 0;
  if (criticalsByTargetType.length > 0) {
    const { data: recipientsRaw } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "rh", "manager"]);
    const recipients = ((recipientsRaw ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (recipients.length > 0) {
      const sample = criticalsByTargetType.slice(0, 3).map((c) => `• ${c.title}`).join("\n");
      const more =
        criticalsByTargetType.length > 3 ? `\n…et ${criticalsByTargetType.length - 3} autres.` : "";
      const inserts = recipients.map((rid) => ({
        recipient_id: rid,
        kind: "anomaly_critical",
        title: `${criticalsByTargetType.length} anomalie(s) critique(s) détectée(s)`,
        body: `${sample}${more}`,
        link: "/admin/anomalies",
        data: { count: criticalsByTargetType.length, kinds: criticalsByTargetType.map((c) => c.kind) },
      }));
      const { error: nErr } = await admin.from("notifications").insert(inserts);
      if (!nErr) notifs = inserts.length;
    }
  }

  await logActivity({
    kind: "anomaly.scan",
    actorLabel: "anomaly-scan (cron)",
    description: `Scan : ${candidates.length} détectées, ${inserted} nouvelles, ${notifs} notifs`,
    data: {
      detected: candidates.length,
      inserted,
      notifications: notifs,
      critical: criticalsByTargetType.length,
    },
  });

  return NextResponse.json({
    ok: true,
    detected: candidates.length,
    inserted,
    deduped: candidates.length - fresh.length,
    notifications: notifs,
    critical: criticalsByTargetType.length,
  });
}
