// GET /api/cron/selftest — Karim 2026-06-16.
//
// Vérifie les chemins critiques de l'application et notifie l'admin
// en cas d'échec, avant qu'un humain ne tombe sur la panne en prod.
//
// Checks effectués :
//   pdf_render      — rendu HTML → PDF via PDFShift (vérifie que les octets %PDF arrivent)
//   gmail_config    — présence de GMAIL_USER + GMAIL_APP_PASSWORD
//   pdfshift_config — présence de PDFSHIFT_API_KEY
//   push_stack      — présence de VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY
//
// Comportement :
//   - Chaque check est isolé (try/catch) — un KO ne casse pas les suivants.
//   - Si au moins un check échoue → notifie les admins via notifyRoles.
//   - Retourne { ok, checks: [{name, ok, detail}] }.
//
// Auth : Bearer CRON_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { renderHtmlToPdf } from "@/lib/html-to-pdf";
import { notifyRoles } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function checkPdfRender(): Promise<CheckResult> {
  const name = "pdf_render";
  try {
    const html =
      "<!DOCTYPE html><html><head><meta charset='utf-8'></head><body><h1>selftest</h1></body></html>";
    const bytes = await renderHtmlToPdf(html);
    // Un PDF valide commence par "%PDF"
    const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (header === "%PDF") {
      return { name, ok: true, detail: `PDF généré — ${bytes.length} octets` };
    }
    return {
      name,
      ok: false,
      detail: `Résultat inattendu — entête reçue : "${header}" (${bytes.length} octets)`,
    };
  } catch (e) {
    return { name, ok: false, detail: (e as Error).message };
  }
}

function checkGmailConfig(): CheckResult {
  const name = "gmail_config";
  const ok = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  return {
    name,
    ok,
    detail: ok
      ? "GMAIL_USER et GMAIL_APP_PASSWORD présents"
      : "GMAIL_USER ou GMAIL_APP_PASSWORD manquant(s)",
  };
}

function checkPdfshiftConfig(): CheckResult {
  const name = "pdfshift_config";
  const ok = !!process.env.PDFSHIFT_API_KEY;
  return {
    name,
    ok,
    detail: ok ? "PDFSHIFT_API_KEY présente" : "PDFSHIFT_API_KEY manquante",
  };
}

function checkPushStack(): CheckResult {
  const name = "push_stack";
  const ok = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  return {
    name,
    ok,
    detail: ok
      ? "VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY présentes"
      : "VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY manquante(s)",
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Exécution des checks — l'ordre est intentionnel (plus lourd en premier)
  const checks: CheckResult[] = await Promise.all([
    checkPdfRender(),
    Promise.resolve(checkGmailConfig()),
    Promise.resolve(checkPdfshiftConfig()),
    Promise.resolve(checkPushStack()),
  ]);

  const failed = checks.filter((c) => !c.ok);
  const ok = failed.length === 0;

  // Notification admin si au moins un check a échoué
  if (!ok) {
    try {
      const listeKo = failed
        .map((c) => `• ${c.name} : ${c.detail}`)
        .join("\n");
      await notifyRoles(["admin"], {
        kind: "selftest_failed",
        title: `Self-test : ${failed.length} échec(s)`,
        body: listeKo,
        link: "/admin",
        data: { checks },
      });
    } catch (e) {
      // Best-effort — ne pas faire échouer la réponse à cause de la notif
      console.error("[selftest] Erreur lors de la notification admin :", (e as Error).message);
    }
  }

  return NextResponse.json({ ok, checks });
}
