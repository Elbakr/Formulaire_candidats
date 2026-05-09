// GET /api/cron/auto-execute — every minute (vercel cron).
//
// Polls `agent_actions.status='proposed'` rows whose `kind` is on the
// auto-execute whitelist and `ai_confidence >= AUTO_EXECUTE_MIN_CONFIDENCE`,
// executing them via `tryAutoExecute`. Limited to 50 per call.
//
// Auth : Bearer CRON_SECRET. Idempotent.

import { NextResponse, type NextRequest } from "next/server";
import { autoExecuteBatch } from "@/lib/ai/auto-execute";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await autoExecuteBatch(50);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/auto-execute]", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
