"use server";

// Karim 2026-06-17 : finalisation de la signature INTERNE de la convention de
// rupture amiable. Injecte la signature du travailleur dans TON layout validé
// (marqueur <!--EMPLOYEE_SIG-->), génère le PDF (PDFShift) et déclenche la
// finalisation (mails 2 parties + clôture emploi). Action publique gardée par le
// token. Remplace le flux DocuSeal.

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { finalizeSignedTermination } from "@/lib/termination-finalize";

export async function submitTerminationSignatureAction(input: {
  terminationId: string;
  token: string;
  signaturePng: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const admin = createAdminClient();
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0].trim() ??
    hdrs.get("x-real-ip") ??
    "unknown";

  const { data: row } = await admin
    .from("contract_terminations")
    .select("id, status, signed_body, signing_token, signing_token_expires_at, employee_signed_at")
    .eq("id", input.terminationId)
    .maybeSingle();
  type R = {
    id: string;
    status: string;
    signed_body: string | null;
    signing_token: string | null;
    signing_token_expires_at: string | null;
    employee_signed_at: string | null;
  };
  const term = row as R | null;
  if (!term) return { error: "Convention introuvable" };
  if (term.signing_token !== input.token) return { error: "Token invalide" };
  if (term.signing_token_expires_at && new Date(term.signing_token_expires_at) < new Date()) {
    return { error: "Lien expiré" };
  }
  if (term.employee_signed_at || ["fully_signed", "executed"].includes(term.status)) {
    return { error: "Déjà signée" };
  }

  // Injecte la signature du travailleur dans le layout (marqueur).
  const signedImg = `<img src="${input.signaturePng}" alt="Signature travailleur" style="display:block;max-width:100%;max-height:50px;margin:0 auto;">`;
  const finalBody = (term.signed_body ?? "").includes("<!--EMPLOYEE_SIG-->")
    ? term.signed_body!.replace("<!--EMPLOYEE_SIG-->", signedImg)
    : (term.signed_body ?? "");

  const nowISO = new Date().toISOString();
  const { error: updErr } = await admin
    .from("contract_terminations")
    .update({
      signed_body: finalBody,
      employee_signature_png: input.signaturePng,
      employee_signed_at: nowISO,
      signed_ip: ip,
    })
    .eq("id", input.terminationId);
  if (updErr) return { error: updErr.message };

  // Génère le PDF du document signé (best-effort ; le flux ne casse pas si KO).
  let pdfBytes: Uint8Array | null = null;
  try {
    const { renderHtmlToPdf } = await import("@/lib/html-to-pdf");
    pdfBytes = await renderHtmlToPdf(finalBody);
  } catch (e) {
    console.warn("[signTermination] PDF KO:", (e as Error).message);
  }

  // Finalisation : stockage PDF, statut, clôture emploi, mails 2 parties, audit.
  await finalizeSignedTermination(admin, input.terminationId, pdfBytes);

  return { ok: true };
}
