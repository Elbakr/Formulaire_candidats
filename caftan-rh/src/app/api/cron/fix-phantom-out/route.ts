// GET /api/cron/fix-phantom-out — Karim 2026-06-15.
//
// Répare les "IN fantômes" : un vrai badge OUT arrivé APRÈS un auto-OUT estimé du
// même jour a été classé IN par l'ancienne alternance, ce qui laisse une session
// ouverte (fausse présence) ET bloque les badges suivants (trigger anti-double).
// Pour chaque [auto_close OUT à Ta] -> [tuya IN à Tb] avec Tb-Ta dans [-0.5h,+3h] :
//   - supprime l'auto-OUT estimé
//   - rebascule le tuya IN en OUT (= la vraie sortie)
//
// ?days=N (défaut 3) fenêtre de scan. Auth : Bearer CRON_SECRET. Idempotent.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const days = Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? "3"));
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { data: autos } = await admin
    .from("clock_entries")
    .select("id, employee_id, occurred_at")
    .eq("source", "auto_close").eq("kind", "out")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true });
  const autoRows = (autos ?? []) as Array<{ id: string; employee_id: string; occurred_at: string }>;

  const fixed: Array<{ employee_id: string; auto_out: string; real_out: string }> = [];
  for (const ao of autoRows) {
    const ta = new Date(ao.occurred_at).getTime();
    const { data: nextRows } = await admin
      .from("clock_entries")
      .select("id, kind, occurred_at, source")
      .eq("employee_id", ao.employee_id)
      .gt("occurred_at", ao.occurred_at)
      .order("occurred_at", { ascending: true })
      .limit(1);
    const nx = (nextRows?.[0] ?? null) as { id: string; kind: string; occurred_at: string; source: string | null } | null;
    if (!nx) continue;
    const deltaH = (new Date(nx.occurred_at).getTime() - ta) / 3600_000;
    if (nx.kind === "in" && nx.source === "tuya" && deltaH > -0.5 && deltaH < 3) {
      // 1) supprime l'auto-OUT estimé
      await admin.from("clock_entries").delete().eq("id", ao.id);
      // 2) rebascule le IN fantôme en OUT réel
      await admin.from("clock_entries").update({
        kind: "out",
        notes: "OUT reel - corrige (etait IN fantome apres auto-OUT estime)",
      }).eq("id", nx.id);
      fixed.push({ employee_id: ao.employee_id, auto_out: ao.occurred_at, real_out: nx.occurred_at });
    }
  }

  return NextResponse.json({ ok: true, scanned: autoRows.length, fixed: fixed.length, details: fixed.slice(0, 20) });
}

// petit helper pour éviter un literal booléen ambigu dans .order()
