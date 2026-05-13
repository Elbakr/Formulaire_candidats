import { NextResponse, type NextRequest } from "next/server";
import { previewSitePlanAction } from "@/app/planning/sites/[code]/actions";

export const dynamic = "force-dynamic";

/**
 * Endpoint de debug RH/admin : appelle previewSitePlanAction et retourne
 * tout en JSON brut pour comprendre pourquoi 0 drafts.
 *
 *   GET /api/debug/preview-site?code=A&week=2026-05-11
 *
 * L'auth est verifiee par requireRole dans previewSitePlanAction.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").toUpperCase();
  const week = url.searchParams.get("week") ?? new Date().toISOString().slice(0, 10);
  if (!code) {
    return NextResponse.json({ error: "Missing code param" }, { status: 400 });
  }
  try {
    const r = await previewSitePlanAction(code, week);
    if ("error" in r) {
      return NextResponse.json({ code, week, error: r.error });
    }
    return NextResponse.json({
      code,
      week,
      drafts_count: r.drafts.length,
      uncovered_count: r.uncovered.length,
      total_uncovered_missing: r.uncovered.reduce((a, u) => a + u.missing, 0),
      drafts: r.drafts,
      uncovered: r.uncovered,
      contract_usage: r.contract_usage,
      seasonal_active: r.seasonal_active ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, stack: (e as Error).stack }, { status: 500 });
  }
}
