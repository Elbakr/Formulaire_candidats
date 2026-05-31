// Karim 2026-05-31 : redirect endpoint qui logge la consultation d'un document
// avant de rediriger vers le signed URL réel. Utilisé dans les mails sortants
// (payslips, contrats, etc.) pour tracer qui a réellement ouvert le PDF.
//
// Token = base64url JSON { doc_type, doc_ref, employee_id, signed_url, exp }
// Pas besoin de signature crypto : si exp passe, on refuse. La signed URL
// reste protégée par Supabase de toute façon.

import { NextRequest, NextResponse } from "next/server";
import { logDocAudit, type DocAuditType } from "@/lib/document-audit-log";

export const dynamic = "force-dynamic";

interface Payload {
  doc_type: DocAuditType;
  doc_ref: string;
  employee_id: string | null;
  signed_url: string;
  exp?: number;
}

function decode(token: string): Payload | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Payload;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const payload = decode(token);
  if (!payload || !payload.signed_url) {
    return new NextResponse("Lien invalide", { status: 400 });
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return new NextResponse("Lien expiré", { status: 410 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent") ?? null;

  // Log non-bloquant
  void logDocAudit({
    employee_id: payload.employee_id,
    doc_type: payload.doc_type,
    doc_ref: payload.doc_ref,
    action: "view",
    channel: "direct_link",
    ip_address: ip,
    user_agent: ua,
  });

  return NextResponse.redirect(payload.signed_url, { status: 302 });
}
