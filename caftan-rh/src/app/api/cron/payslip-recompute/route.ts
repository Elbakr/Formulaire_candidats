// Karim 2026-06-16 : endpoint de recalcul manuel d'une fiche de paie.
// Permet de corriger une avance obsolète qui faisait tomber amount_to_pay à 0
// (et donc supprimait le QR EPC). En corrigeant l'avance via ce POST, le QR
// se régénère automatiquement.
//
// Usage :
//   POST /api/cron/payslip-recompute
//   Authorization: Bearer <CRON_SECRET>
//   Content-Type: application/json
//   { "payslipId": "<uuid>", "advance": 0 }
//
// Réponse :
//   { "ok": true, "amount_to_pay": 1234.56, "qr": "generated" | "none" }
//   { "ok": false, "error": "..." }

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { recomputePayslipAdvance } from "@/app/admin/payslips/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  // Auth : CRON_SECRET
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Lecture du body
  let body: { payslipId?: unknown; advance?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 });
  }

  const payslipId = typeof body.payslipId === "string" ? body.payslipId.trim() : null;
  const advance = typeof body.advance === "number" ? body.advance : null;

  if (!payslipId) {
    return NextResponse.json({ ok: false, error: "payslipId requis (string)" }, { status: 400 });
  }
  if (advance === null || !Number.isFinite(advance) || advance < 0) {
    return NextResponse.json({ ok: false, error: "advance requis (number >= 0)" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const result = await recomputePayslipAdvance(admin, payslipId, advance);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }
    return NextResponse.json({
      ok: true,
      amount_to_pay: result.amount_to_pay,
      qr: result.qr,
    });
  } catch (e) {
    console.error("[payslip-recompute] erreur inattendue:", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
