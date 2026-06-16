// Karim 2026-06-16 : endpoint de re-ingestion Tuya.
// Permet de recuperer les badges passes qui etaient droppes (slot non mappe
// au moment du badge) apres avoir cree le mapping manquant.
//
// Usage manuel ou declenche en best-effort par les actions de mapping.
//
// Auth : Authorization: Bearer ${CRON_SECRET}
// Params optionnels :
//   ?days=2      fenetre en jours (defaut 2, max 30)
//   ?device=xxx  limite a un seul device Tuya

import { NextResponse, type NextRequest } from "next/server";
import { reingestTuyaWindow } from "@/lib/tuya-reingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = new URL(request.url).searchParams;
    const daysParam = Number(params.get("days") ?? "");
    const sinceDays = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined;
    const deviceId = params.get("device") ?? undefined;

    const result = await reingestTuyaWindow({ sinceDays, deviceId });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
