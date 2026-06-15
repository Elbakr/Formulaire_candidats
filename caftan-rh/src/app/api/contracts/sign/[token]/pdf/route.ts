// Karim 2026-06-15 : sert le contrat en PDF FIDÈLE (super layout rendu par
// Chromium). Public, gardé par le signing_token (le token EST le secret).
// Sert le rendered_body courant : avant signature = version à signer, après =
// version signée (les 2 signatures injectées).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { renderHtmlToPdf } from "@/lib/html-to-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("employee_contracts")
    .select("full_name, rendered_body, status")
    .eq("signing_token", token)
    .maybeSingle();
  const row = data as { full_name: string; rendered_body: string | null; status: string } | null;
  if (!row || !row.rendered_body) {
    return new NextResponse("Contrat introuvable", { status: 404 });
  }
  // On ne rend en PDF que le « super layout » (document HTML complet).
  if (!/<!doctype html|<html[\s>]/i.test(row.rendered_body)) {
    return new NextResponse("Ce contrat n'a pas de version PDF (ancien format).", { status: 404 });
  }

  try {
    const pdf = await renderHtmlToPdf(row.rendered_body);
    const slug =
      (row.full_name || "contrat")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_|_$/g, "") || "contrat";
    const forceDownload = new URL(req.url).searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="Contrat_${slug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new NextResponse(`Erreur de génération PDF : ${(e as Error).message}`, { status: 500 });
  }
}
