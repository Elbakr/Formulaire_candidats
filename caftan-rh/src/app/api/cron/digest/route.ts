// Daily digest cron — Vercel cron triggers /api/cron/digest?slot=morning|evening
// Auth via Authorization: Bearer ${CRON_SECRET}.

import { NextResponse, type NextRequest } from "next/server";
import { runDigest, type DigestSlot } from "@/lib/digest/run";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slotParam = request.nextUrl.searchParams.get("slot") ?? "morning";
  const slot: DigestSlot = slotParam === "evening" ? "evening" : "morning";

  try {
    const result = await runDigest({ slot });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message ?? "digest failed" },
      { status: 500 },
    );
  }
}
