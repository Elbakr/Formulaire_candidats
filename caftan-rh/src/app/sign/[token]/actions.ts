"use server";

// Karim 2026-05-22 : finalisation signature. Stocke la signature PNG, marque
// le contrat signed, envoie un mail au RH (Karim) + a l employe avec le
// contrat sign en texte. La generation PDF complete est faite en arrière-plan
// (lib pdf-lib via /api/contracts/[id]/pdf).

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { activateEmployeeAccount } from "@/lib/employee-activation";

export async function submitSignatureAction(input: {
  contractId: string;
  token: string;
  signaturePng: string;
}): Promise<{ ok?: boolean; error?: string }> {
  // Action publique : pas de requireRole, on valide via le token.
  const supabase = createAdminClient();
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0].trim() ??
    hdrs.get("x-real-ip") ??
    "unknown";

  // Re-fetch pour valider token + recuperer le mail employe
  const { data: row } = await supabase
    .from("employee_contracts")
    .select(
      "id, employee_id, full_name, status, rendered_body, signing_token, signing_token_expires_at, signed_at, template_id, template:contract_templates(name, title)",
    )
    .eq("id", input.contractId)
    .maybeSingle();
  type R = {
    id: string;
    employee_id: string;
    full_name: string;
    status: string;
    rendered_body: string | null;
    signing_token: string | null;
    signing_token_expires_at: string | null;
    signed_at: string | null;
    template_id: string | null;
    template: { name: string; title: string } | null;
  };
  const contract = row as R | null;
  if (!contract) return { error: "Contrat introuvable" };
  if (contract.signing_token !== input.token) return { error: "Token invalide" };
  if (contract.signing_token_expires_at && new Date(contract.signing_token_expires_at) < new Date()) {
    return { error: "Lien expiré" };
  }
  if (contract.status === "signed" || contract.signed_at) {
    return { error: "Déjà signé" };
  }

  // Karim 2026-06-15 : injecte la signature de l'employé dans le « super layout »
  // stocké (marqueur <!--EMPLOYEE_SIG-->) -> le rendered_body devient le document
  // final entièrement signé (employeur pré-signé + employé). Repli no-op si le
  // marqueur est absent (anciens contrats markdown).
  const nowISO = new Date().toISOString();
  const signedImg = `<img src="${input.signaturePng}" alt="Signature ${contract.full_name}" style="display:block;max-width:100%;max-height:50px;margin:0 auto;">`;
  const signedBody = (contract.rendered_body ?? "").includes("<!--EMPLOYEE_SIG-->")
    ? contract.rendered_body!.replace("<!--EMPLOYEE_SIG-->", signedImg)
    : contract.rendered_body;

  const { error: updErr } = await supabase
    .from("employee_contracts")
    .update({
      status: "signed",
      signed_at: nowISO,
      signed_ip: ip,
      employee_signature_png: input.signaturePng,
      ...(signedBody != null ? { rendered_body: signedBody } : {}),
    })
    .eq("id", input.contractId);
  if (updErr) return { error: updErr.message };

  // Karim 2026-07-04 : STOCKE le PDF du contrat signé (upload storage + signed_pdf_url)
  // pour que « Voir contrat signé » (fiche employé) et /rh/documents pointent sur un
  // VRAI fichier (avant, le PDF signé n'existait qu'en pièce jointe du mail). Le PDF
  // est réutilisé pour le mail plus bas (évite un 2e rendu Chromium).
  let signedPdfBytes: Uint8Array | null = null;
  if (signedBody) {
    try {
      const { renderHtmlToPdf } = await import("@/lib/html-to-pdf");
      signedPdfBytes = await renderHtmlToPdf(signedBody);
      const path = `contracts/${contract.employee_id}/contrat-signe-${input.contractId}.pdf`;
      const up = await supabase.storage.from("documents").upload(path, signedPdfBytes, { contentType: "application/pdf", upsert: true });
      if (!up.error) {
        const { data: su } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (su?.signedUrl) {
          await supabase.from("employee_contracts").update({ signed_pdf_url: su.signedUrl }).eq("id", input.contractId);
        }
      }
    } catch (e) {
      console.warn("[sign] stockage PDF signé KO:", (e as Error).message);
    }
  }

  // Karim 2026-06-13 (Phase 2) : activation du compte employé à la signature
  // (candidate -> employee). Best-effort, ne bloque pas la signature.
  await activateEmployeeAccount(supabase, contract.employee_id);

  // Recupere l email de l employe
  const { data: emp } = await supabase
    .from("employees")
    .select("email, full_name")
    .eq("id", contract.employee_id)
    .maybeSingle();
  const employeeEmail = (emp as { email: string | null } | null)?.email ?? null;
  const employeeName = (emp as { full_name: string } | null)?.full_name ?? contract.full_name;

  // Mail RH : notif "X a signé"
  {
    const docTitle = contract.template?.title ?? "Contrat de travail";
    const subjectRH = `CaftanRH — ${employeeName} a signé son ${docTitle}`;
    const bodyRH = `Salut Karim,\n\n${employeeName} a signé son ${docTitle} le ${new Date(nowISO).toLocaleString("fr-BE")}.\nIP : ${ip}\n\nLe contrat complet est consultable sur la fiche employé :\n/planning/employees/${contract.employee_id}/contract\n\nLa signature électronique est valable légalement (eIDAS, Belgique).\n\nCaftanRH`;
    try {
      const { sendAppMail } = await import("@/lib/app-mail");
      await sendAppMail({
        to: "elbazikarim@gmail.com",
        toName: "Karim",
        subject: subjectRH,
        body: bodyRH,
        source: "contract_signed_rh",
        employeeId: contract.employee_id,
      });
    } catch { /* best-effort */ }
  }

  // Karim 2026-06-15 : le mail employé « copie à suivre » ne livrait JAMAIS le
  // contrat. On l'envoie désormais RÉELLEMENT en pièce jointe (bloc ci-dessous).

  // Karim 2026-06-15 : ENVOI RÉEL du contrat signé au candidat (+ archive RH en
  // bcc) en pièce jointe. signedBody = le « super layout » avec les DEUX
  // signatures intégrées. On l'envoie en HTML (ouvrable + imprimable -> PDF via
  // le navigateur ; le projet n'a pas de moteur HTML→PDF). Via Resend/Gmail SMTP
  // (PJ natives), best-effort : n'échoue jamais la signature.
  const docTitle2 = contract.template?.title ?? "Contrat de travail";
  if (employeeEmail && signedBody) {
    try {
      const { sendMailWithAttachments } = await import("@/lib/mail-with-attachments");
      const slug =
        employeeName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") ||
        "contrat";
      // Réutilise le PDF déjà généré/stocké ci-dessus ; repli HTML si le rendu a échoué.
      let attachment: { filename: string; content: Uint8Array; contentType: string };
      if (signedPdfBytes) {
        attachment = { filename: `Contrat_signe_${slug}.pdf`, content: signedPdfBytes, contentType: "application/pdf" };
      } else {
        attachment = {
          filename: `Contrat_signe_${slug}.html`,
          content: new TextEncoder().encode(signedBody),
          contentType: "text/html; charset=utf-8",
        };
      }
      await sendMailWithAttachments({
        to: employeeEmail,
        toName: employeeName,
        subject: `Ton contrat signé — ${docTitle2}`,
        body:
          `Bonjour ${employeeName.split(" ")[0]},\n\n` +
          `Ton ${docTitle2} est officiellement signé. ✅\n` +
          `Tu le trouveras en pièce jointe (PDF, avec les deux signatures). Conserve-le précieusement.\n\n` +
          `Bienvenue dans l'équipe !\n\nCaftanRH`,
        attachments: [attachment],
        bccHr: true,
        source: "contract_signed_copy",
        employeeId: contract.employee_id,
      });
    } catch (e) {
      console.warn("[sign] envoi contrat signé:", (e as Error).message);
    }
  }

  return { ok: true };
}
