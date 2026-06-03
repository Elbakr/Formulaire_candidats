// Karim 2026-06-03 : cron hebdomadaire recompute soldes congés annuels.
// Plus reactif que cron annuel (capte les changements weekly_hours,
// end_date, nouveaux time_off_requests approvés).

import { NextResponse, type NextRequest } from "next/server";
import { recomputeAllBalances } from "@/lib/leave-balance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const year = new Date().getFullYear();
  try {
    const result = await recomputeAllBalances(year);
    return NextResponse.json({ ok: true, year, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
