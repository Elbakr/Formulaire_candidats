import { NextResponse, type NextRequest } from "next/server";
import { pollImapInbox } from "@/lib/inbound/imap-poller";
import { isTransientImapError } from "@/lib/inbound/imap-retry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      { error: "GMAIL_USER ou GMAIL_APP_PASSWORD non configuré." },
      { status: 503 },
    );
  }

  try {
    const result = await pollImapInbox();
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    // Karim 2026-06-14 : un aléa IMAP transitoire (« Command failed », socket,
    // timeout) ne doit PAS faire échouer le cron (sinon mail « All jobs failed »
    // alors que rien n'est cassé). On répond 200 soft_error ; le prochain tick
    // réessaiera. On garde 5xx pour les vraies pannes (code, config).
    if (isTransientImapError(e)) {
      return NextResponse.json({ ok: false, soft_error: msg, transient: true });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
