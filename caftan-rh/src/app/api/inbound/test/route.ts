// Test endpoint — bypasses signature validation. DEV ONLY.
//
// Accepts a simplified JSON :
//   { from, subject, text, html?, in_reply_to?, attachments?: [{filename, content_base64, mime}] }
// Used by `npm run inbound:test` and `npm run inbound:demo`.

import { NextResponse, type NextRequest } from "next/server";
import { parseInbound } from "@/lib/inbound/parse";
import { processInbound } from "@/lib/inbound/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Test endpoint disabled in production." },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const o = (body ?? {}) as Record<string, unknown>;
  const attachments = Array.isArray(o.attachments)
    ? (o.attachments as Array<Record<string, unknown>>).map((a) => ({
        filename: String(a.filename ?? "attachment.bin"),
        content_type: String(a.mime ?? a.content_type ?? "application/octet-stream"),
        content_base64: String(a.content_base64 ?? ""),
      }))
    : [];

  const payload = {
    from: o.from ?? null,
    to: o.to ?? "hr@caftanfactory.com",
    subject: o.subject ?? null,
    text: o.text ?? null,
    html: o.html ?? null,
    in_reply_to: o.in_reply_to ?? null,
    message_id: o.message_id ?? `<test-${Date.now()}@caftan.local>`,
    headers: o.headers ?? {},
    attachments,
  };

  const parsed = parseInbound(payload);
  if (!parsed.from_email) {
    return NextResponse.json({ error: "Missing 'from' address." }, { status: 400 });
  }

  try {
    const res = await processInbound(parsed);
    return NextResponse.json({
      ok: true,
      id: res.inbound_email_id,
      match: res.match,
      thread_id: res.thread_id,
      message_id: res.message_id,
      attachments: res.attachments.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
