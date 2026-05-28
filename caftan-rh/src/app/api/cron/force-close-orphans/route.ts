// Karim 2026-05-26 : route admin one-shot pour force-close les IN orphans
// >24h en utilisant le systeme d inference statistique.
//
// Pour chaque IN orphan :
//   1. Charge l historique 15j de l employe
//   2. Calcule son profil (heure OUT typique)
//   3. Insère un OUT virtuel a l heure inferee (avec audit complet)
//   4. Notifie RH pour validation
//
// Auth : Bearer ${CRON_SECRET} OU admin connecte.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { buildEmployeeProfile, inferMissingOut, formatCorrectionNote } from "@/lib/tuya-correction-inference";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  // Auth : soit Bearer CRON_SECRET, soit admin connecté
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    try {
      await requireRole(["admin"]);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const nowMs = Date.now();

  // Trouve tous les IN orphans > 24h (sans OUT meme jour apres)
  const { data: orphansRaw } = await admin
    .from("clock_entries")
    .select("id, employee_id, shift_id, site_id, occurred_at")
    .eq("kind", "in")
    .lte("occurred_at", new Date(nowMs - 24 * 3600_000).toISOString());

  const orphans = ((orphansRaw ?? []) as Array<{
    id: string;
    employee_id: string;
    shift_id: string | null;
    site_id: string | null;
    occurred_at: string;
  }>).filter(async () => true); // placeholder

  // Filtre : pas de OUT meme jour apres
  const trueOrphans: typeof orphans = [];
  for (const o of orphans) {
    const day = o.occurred_at.slice(0, 10);
    const { count } = await admin
      .from("clock_entries")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", o.employee_id)
      .eq("kind", "out")
      .gte("occurred_at", o.occurred_at)
      .lt("occurred_at", `${day}T23:59:59Z`);
    if (!count || count === 0) trueOrphans.push(o);
  }

  const results: Array<{ employee_id: string; out_at: string; confidence: number; reason: string }> = [];

  // Charge tous les site_needs pour clamp close_time
  const { data: needsRaw } = await admin
    .from("site_needs")
    .select("site_id, day_of_week, end_time, is_enabled")
    .eq("is_enabled", true);
  const needs = ((needsRaw ?? []) as Array<{ site_id: string; day_of_week: number; end_time: string; is_enabled: boolean }>);
  function siteCloseFor(siteId: string, dateISO: string): string | null {
    const dow = new Date(dateISO + "T00:00:00").getDay();
    const matching = needs.filter((n) => n.site_id === siteId && n.day_of_week === dow);
    if (matching.length === 0) return null;
    return matching.reduce((a, n) => (a > n.end_time.slice(0, 5) ? a : n.end_time.slice(0, 5)), matching[0].end_time.slice(0, 5));
  }

  for (const orphan of trueOrphans) {
    // Charge historique 15j
    const histSince = new Date(new Date(orphan.occurred_at).getTime() - 15 * 86400_000).toISOString();
    const { data: hist } = await admin
      .from("clock_entries")
      .select("kind, occurred_at, source")
      .eq("employee_id", orphan.employee_id)
      .gte("occurred_at", histSince)
      .lt("occurred_at", orphan.occurred_at)
      .order("occurred_at", { ascending: true });
    const profile = buildEmployeeProfile(
      (hist ?? []) as Array<{ kind: "in" | "out"; occurred_at: string; source: string | null }>,
    );

    const inferred = inferMissingOut({ occurred_at: orphan.occurred_at }, profile);

    // S assure outAt > inAt ET reste le MEME JOUR (clamp au close_time site +30min)
    let outIso = inferred.outAt;
    const orphanDay = orphan.occurred_at.slice(0, 10);
    if (outIso.slice(0, 10) !== orphanDay) {
      // OUT propose est un autre jour -> clamp
      const closeTime = orphan.site_id ? siteCloseFor(orphan.site_id, orphanDay) : null;
      if (closeTime) {
        outIso = new Date(new Date(`${orphanDay}T${closeTime}:00+02:00`).getTime() + 30 * 60_000).toISOString();
      } else {
        // Fallback : IN + 2h30 cappe a 23:59 meme jour
        const inTs = new Date(orphan.occurred_at).getTime();
        let proposed = inTs + 150 * 60_000;
        const endOfDay = new Date(`${orphanDay}T23:59:00+02:00`).getTime();
        if (proposed > endOfDay) proposed = endOfDay;
        outIso = new Date(proposed).toISOString();
      }
    }
    if (new Date(outIso).getTime() <= new Date(orphan.occurred_at).getTime()) {
      // OUT <= IN -> IN + 30 min cap a 23:59
      const inTs = new Date(orphan.occurred_at).getTime();
      let proposed = inTs + 30 * 60_000;
      const endOfDay = new Date(`${orphanDay}T23:59:00+02:00`).getTime();
      if (proposed > endOfDay) proposed = endOfDay;
      outIso = new Date(proposed).toISOString();
    }

    const note = `Auto-close force >24h via inference (confiance ${inferred.confidence}%). ${inferred.reason}. ${formatCorrectionNote({
      correctedKind: "out",
      inferredOutAt: outIso,
      inferredInAt: null,
      confidence: inferred.confidence,
      reason: inferred.reason,
      autoApplied: inferred.confidence >= 85,
      requiresHrReview: true,
    })}`;

    const { error } = await admin.from("clock_entries").insert({
      employee_id: orphan.employee_id,
      shift_id: orphan.shift_id,
      site_id: orphan.site_id,
      kind: "out",
      occurred_at: outIso,
      entry_method: "auto_shift",
      source: "auto_close",
      auto_clocked_out: true,
      notes: note,
    });
    if (!error) {
      results.push({
        employee_id: orphan.employee_id,
        out_at: outIso,
        confidence: inferred.confidence,
        reason: inferred.reason,
      });
    }
  }

  // Notifie RH (1 notif groupée)
  if (results.length > 0) {
    const { data: hrsRaw } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
    const hrIds = ((hrsRaw ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (hrIds.length > 0) {
      const inserts = hrIds.map((hrId) => ({
        recipient_id: hrId,
        kind: "tuya_force_close",
        title: `Force-close ${results.length} IN orphans (inference statistique)`,
        body: `${results.length} pointages IN sans OUT depuis >24h ont ete clos avec inference statistique. A valider manuellement.`,
        link: "/admin/tuya/auto-corrections",
        data: { count: results.length, results },
      }));
      await admin.from("notifications").insert(inserts);
    }
  }

  return NextResponse.json({ ok: true, force_closed: results.length, details: results });
}
