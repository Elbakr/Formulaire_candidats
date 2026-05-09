// Resend Inbound webhook receiver.
//
// Validates the HMAC-SHA256 signature using RESEND_INBOUND_SECRET against the
// raw request body, then parses + processes the email through the cascade.
//
// Behaviour :
//  - If RESEND_INBOUND_SECRET is missing → 503 (clear ops error).
//  - If signature header is missing/invalid → 401.
//  - Otherwise → parse + process, return { ok, id, match }.

import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseInbound } from "@/lib/inbound/parse";
import { processInbound } from "@/lib/inbound/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_INBOUND_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "RESEND_INBOUND_SECRET non configuré. Ajoute-le dans .env.local pour activer le webhook inbound.",
      },
      { status: 503 },
    );
  }

  // Read raw body (string) so signature can be validated against the exact bytes.
  const rawBody = await request.text();

  const signature =
    request.headers.get("webhook-signature") ??
    request.headers.get("svix-signature") ??
    request.headers.get("x-resend-signature") ??
    "";
  if (!signature) {
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 401 });
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  // Accept either "sha256=<hex>" or just the hex
  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  if (!safeEqual(expected, provided.trim())) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

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
      attachments: res.attachments.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[inbound] process failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    description: "Inbound webhook receiver. POST JSON payload.",
    secret_configured: !!process.env.RESEND_INBOUND_SECRET,
  });
}
