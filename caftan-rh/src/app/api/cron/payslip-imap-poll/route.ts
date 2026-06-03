// Karim 2026-06-03 : cron qui poll Gmail IMAP hr@caftanfactory.com et
// importe automatiquement les fiches de paie reçues du secrétariat social.

import { NextResponse, type NextRequest } from "next/server";
import { pollPayslipsFromImap } from "@/lib/inbound/payslip-imap-poller";

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
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
