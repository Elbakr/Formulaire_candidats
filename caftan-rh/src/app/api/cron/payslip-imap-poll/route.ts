// Karim 2026-06-03 : cron qui poll Gmail IMAP hr@caftanfactory.com et
// importe automatiquement les fiches de paie reçues du secrétariat social.

import { NextResponse, type NextRequest } from "next/server";
import { pollPayslipsFromImap } from "@/lib/inbound/payslip-imap-poller";
import { isTransientImapError } from "@/lib/inbound/imap-retry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Auth Bearer (Vercel Cron Scheduler OR appel manuel admin)
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      { error: "GMAIL_USER + GMAIL_APP_PASSWORD non configurés (hr@caftanfactory.com)" },
      { status: 503 },
    );
  }

  try {
    const result = await pollPayslipsFromImap();
    // Karim 2026-07-03 : filet — re-matche les orphelines (ex-employés archivés)
    // après chaque import. Best-effort, ne fait jamais échouer le poll.
    let rematched = 0;
    try {
      const { rematchOrphanPayslips } = await import("@/lib/payslip-rematch");
      rematched = (await rematchOrphanPayslips()).rematched;
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true, ...result, rematched });
  } catch (e) {
    const msg = (e as Error).message;
    // Karim 2026-06-14 : aléa IMAP transitoire → 200 soft_error (pas de mail
    // d'échec). Le prochain tick réessaiera. 5xx réservé aux vraies pannes.
    if (isTransientImapError(e)) {
      return NextResponse.json({ ok: false, soft_error: msg, transient: true });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
