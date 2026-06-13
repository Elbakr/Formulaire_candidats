import { NextResponse, type NextRequest } from "next/server";
import { pollTuyaLogs } from "@/lib/tuya-poll";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron toutes les 5 minutes (Karim 2026-05-24) - fetch les unlock events
 * des terminaux Tuya et insere les passages dans clock_entries avec
 * source='tuya'. Dedupe via tuya_access_log_id unique.
 *
 * A configurer dans vercel.json :
 *   { "path": "/api/cron/tuya-poll", "schedule": "{$asterisk}/5 {$asterisk} {$asterisk} {$asterisk} {$asterisk}" }
 *
 * Auth : Bearer ${CRON_SECRET}.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Support ?lookback_days=7 pour backfill manuel (sinon incremental sur 1h).
    const lookbackDays = Number(new URL(request.url).searchParams.get("lookback_days") ?? "");
    const forceLookbackMs = Number.isFinite(lookbackDays) && lookbackDays > 0
      ? lookbackDays * 86400_000
      : undefined;
    const result = await pollTuyaLogs(forceLookbackMs ? { forceLookbackMs } : undefined);
    // Karim 2026-06-13 : alerte terminal hors-ligne aux fenetres matin/soir.
    // Best-effort : ne doit jamais faire echouer le poll.
    let deviceHealth = null;
    try {
      const { checkOfflineDevicesAndAlert } = await import("@/lib/tuya-device-health");
      deviceHealth = await checkOfflineDevicesAndAlert();
    } catch {
      /* non bloquant */
    }
    return NextResponse.json({ ...result, device_health: deviceHealth });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
