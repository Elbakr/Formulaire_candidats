// Karim 2026-07-04 : purge RGPD des logs d'accès candidat > 24 mois (rétention
// validée). Fait respecter la limitation de conservation (art. 5(1)(e) RGPD).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 730 * 24 * 3600_000).toISOString(); // 24 mois
  const { error, count } = await admin
    .from("candidate_access_logs")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, purged: count ?? 0, cutoff: cutoff.slice(0, 10) });
}
