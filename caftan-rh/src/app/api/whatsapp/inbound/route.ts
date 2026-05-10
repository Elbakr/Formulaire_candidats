// Twilio WhatsApp inbound webhook.
//
// Twilio posts application/x-www-form-urlencoded with fields :
//   From, To, Body, MessageSid, NumMedia, MediaUrl0..N, MediaContentType0..N, ...
//
// Behaviour :
//   - If WhatsApp is not configured / disabled → 503 with helpful JSON.
//   - Validates the X-Twilio-Signature header against the request URL + form body.
//   - Tries to match the sender phone (normalized to E.164) against `candidates.phone`.
//   - On match → insert a `messages` row (direction=inbound, email_provider_id='whatsapp.twilio').
//   - On match, the candidate's `whatsapp_opt_in` becomes true (a reply == consent)
//     and `whatsapp_last_inbound_at` is updated for the 24 h window.
//   - STOP / STOPALL / ARRÊT / DÉSABONNEMENT → mark candidate as blocked.
//   - On no match → insert into `inbound_emails` with status='unmatched'.
//   - Always replies with empty TwiML XML so Twilio is happy.

import { NextResponse, type NextRequest } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/server";
import { getWhatsAppSettings, normalizePhoneE164 } from "@/lib/whatsapp/client";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function emptyTwimlResponse() {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    },
  );
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Extract the public URL Twilio used to reach us — required for signature validation. */
function publicWebhookUrl(req: NextRequest): string {
  // Prefer X-Forwarded-* if behind a proxy (Vercel sets these).
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = forwardedProto ?? "https";
  // Twilio computes the signature against the full URL including the path & query.
  const url = new URL(req.url);
  return `${proto}://${host}${url.pathname}${url.search}`;
}

const STOP_KEYWORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "arret",
  "arrêt",
  "desabonnement",
  "désabonnement",
  "desinscription",
  "désinscription",
]);

function isStopMessage(body: string): boolean {
  const normalized = body.trim().toLowerCase();
  if (!normalized) return false;
  // Single-word match — Meta convention is one keyword on its own line.
  return STOP_KEYWORDS.has(normalized);
}

export async function POST(request: NextRequest) {
  const settings = await getWhatsAppSettings();
  if (!settings || !settings.enabled || !settings.twilio_auth_token) {
    return jsonError(
      "WhatsApp non configuré ou désactivé. Active-le dans /admin/integrations/whatsapp.",
      503,
    );
  }

  // Twilio sends application/x-www-form-urlencoded
  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const formObject: Record<string, string> = {};
  for (const [k, v] of params.entries()) formObject[k] = v;

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = publicWebhookUrl(request);

  // Skip validation only when explicitly opted-in (CI / local without signing)
  const skipValidation = process.env.TWILIO_SKIP_SIGNATURE_VALIDATION === "1";
  if (!skipValidation) {
    if (!signature) {
      return jsonError("Missing X-Twilio-Signature.", 401);
    }
    const valid = twilio.validateRequest(
      settings.twilio_auth_token,
      signature,
      url,
      formObject,
    );
    if (!valid) {
      return jsonError("Invalid Twilio signature.", 401);
    }
  }

  const fromAddress = formObject["From"] ?? ""; // "whatsapp:+32468596100"
  const toAddress = formObject["To"] ?? "";
  const body = formObject["Body"] ?? "";
  const messageSid = formObject["MessageSid"] ?? formObject["SmsMessageSid"] ?? null;
  const numMedia = Number(formObject["NumMedia"] ?? "0") || 0;

  if (!fromAddress) {
    return jsonError("Missing 'From' field.", 400);
  }

  // Collect media (Twilio gives MediaUrl0, MediaContentType0, …)
  const attachments: Array<{ url: string; content_type: string | null }> = [];
  for (let i = 0; i < Math.min(numMedia, 10); i++) {
    const u = formObject[`MediaUrl${i}`];
    if (!u) continue;
    attachments.push({
      url: u,
      content_type: formObject[`MediaContentType${i}`] ?? null,
    });
  }

  const fromPhoneRaw = fromAddress.replace(/^whatsapp:/, "");
  const fromPhone = normalizePhoneE164(fromPhoneRaw) ?? fromPhoneRaw;

  const admin = createAdminClient();
  const stopRequested = isStopMessage(body);

  // Try to match candidate by normalized phone
  let matchedApplicationId: string | null = null;
  let matchedCandidateId: string | null = null;

  try {
    // Quick exact match on raw phone digits suffix (last 9 digits = BE national length)
    const lastDigits = fromPhone.replace(/\D/g, "").slice(-9);
    if (lastDigits.length >= 8) {
      const { data: cands } = await admin
        .from("candidates")
        .select("id, phone")
        .not("phone", "is", null)
        .ilike("phone", `%${lastDigits}`)
        .limit(20);

      const hit = (cands ?? []).find((c) => {
        const candPhone = normalizePhoneE164((c as { phone: string | null }).phone);
        return candPhone && candPhone === fromPhone;
      }) as { id: string } | undefined;

      if (hit?.id) {
        matchedCandidateId = hit.id;
        const { data: app } = await admin
          .from("applications")
          .select("id")
          .eq("candidate_id", hit.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        matchedApplicationId = (app as { id?: string } | null)?.id ?? null;
      }
    }
  } catch (e) {
    console.warn("[whatsapp.inbound] candidate lookup failed:", (e as Error).message);
  }

  // Update candidate compliance state on match
  if (matchedCandidateId) {
    const nowIso = new Date().toISOString();
    if (stopRequested) {
      await admin
        .from("candidates")
        .update({
          whatsapp_blocked: true,
          whatsapp_block_reason: "user_requested_stop",
          whatsapp_last_inbound_at: nowIso,
        })
        .eq("id", matchedCandidateId);

      await logActivity({
        kind: "whatsapp.opt_out",
        targetType: "candidate",
        targetId: matchedCandidateId,
        description: `Opt-out WhatsApp (STOP) reçu de ${fromPhone}`,
        data: {
          provider: "whatsapp.twilio",
          from_phone: fromPhone,
          sid: messageSid,
          body: body.slice(0, 200),
        },
      });
    } else {
      // Read-then-write so we don't overwrite an existing opt_in_at timestamp.
      const { data: existing } = await admin
        .from("candidates")
        .select("whatsapp_opt_in, whatsapp_opt_in_at")
        .eq("id", matchedCandidateId)
        .maybeSingle();
      const wasOptedIn = !!existing?.whatsapp_opt_in;
      const optInAt = existing?.whatsapp_opt_in_at ?? nowIso;

      await admin
        .from("candidates")
        .update({
          whatsapp_opt_in: true,
          whatsapp_opt_in_at: optInAt,
          whatsapp_last_inbound_at: nowIso,
        })
        .eq("id", matchedCandidateId);

      if (!wasOptedIn) {
        await logActivity({
          kind: "whatsapp.opt_in",
          targetType: "candidate",
          targetId: matchedCandidateId,
          description: `Opt-in WhatsApp implicite (reply) de ${fromPhone}`,
          data: {
            provider: "whatsapp.twilio",
            from_phone: fromPhone,
            sid: messageSid,
          },
        });
      }
    }
  }

  if (matchedApplicationId) {
    const { error: insErr } = await admin.from("messages").insert({
      application_id: matchedApplicationId,
      direction: "inbound",
      subject: null,
      body: (body || "(message vide)").slice(0, 5000),
      from_email: null,
      from_name: null,
      email_provider_id: "whatsapp.twilio",
      whatsapp_sid: messageSid,
      wa_from_phone: fromPhone,
      wa_to_phone: toAddress.replace(/^whatsapp:/, ""),
      attachments: attachments.length ? attachments : undefined,
    });
    if (insErr) {
      console.error("[whatsapp.inbound] messages insert failed:", insErr.message);
    }

    await logActivity({
      kind: "email.received",
      targetType: "application",
      targetId: matchedApplicationId,
      description: `WhatsApp reçu de ${fromPhone}${stopRequested ? " (STOP)" : ""}`.slice(0, 200),
      data: {
        provider: "whatsapp.twilio",
        from_phone: fromPhone,
        sid: messageSid,
        media_count: attachments.length,
        candidate_id: matchedCandidateId,
        stop: stopRequested,
      },
    });
  } else {
    // Fall back to inbound_emails for triage UI consistency.
    const subject = `[WhatsApp] ${fromPhone}`;
    const { error: inboundErr } = await admin.from("inbound_emails").insert({
      from_email: `whatsapp:${fromPhone}`,
      from_name: null,
      to_email: toAddress || null,
      subject,
      body_text: body || null,
      body_html: null,
      message_id: messageSid,
      in_reply_to: null,
      references_header: null,
      headers: { provider: "whatsapp.twilio", twilio: formObject },
      raw: { provider: "whatsapp.twilio", form: formObject },
      attachments: attachments.length ? attachments : [],
      matched_application_id: null,
      matched_via: "unmatched",
      match_confidence: 0,
      status: "unmatched",
      processed_at: new Date().toISOString(),
    });
    if (inboundErr) {
      console.error("[whatsapp.inbound] inbound_emails insert failed:", inboundErr.message);
    }
  }

  await admin
    .from("whatsapp_settings")
    .update({ last_inbound_at: new Date().toISOString() })
    .eq("id", 1);

  // Return a polite confirmation TwiML on STOP. Matched candidates only —
  // for unmatched we don't want to spam unknown numbers.
  if (stopRequested && matchedCandidateId) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Vous êtes désinscrit. Vous ne recevrez plus de messages WhatsApp de notre part.</Message></Response>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      },
    );
  }

  return emptyTwimlResponse();
}

export async function GET() {
  const settings = await getWhatsAppSettings();
  return NextResponse.json({
    ok: true,
    description: "Twilio WhatsApp inbound webhook. POST application/x-www-form-urlencoded.",
    enabled: !!settings?.enabled,
    sandbox: !!settings?.is_sandbox,
    has_credentials: !!(settings?.twilio_account_sid && settings?.twilio_auth_token),
  });
}
