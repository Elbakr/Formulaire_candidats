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

  // Envoi mails (RH + employe) via EmailJS
  const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY) {
    const docTitle = contract.template?.title ?? "Contrat de travail";
    const subjectRH = `CaftanRH — ${employeeName} a signé son ${docTitle}`;
    const bodyRH = `Salut Karim,\n\n${employeeName} a signé son ${docTitle} le ${new Date(nowISO).toLocaleString("fr-BE")}.\nIP : ${ip}\n\nLe contrat complet est consultable sur la fiche employé :\n/planning/employees/${contract.employee_id}/contract\n\nLa signature électronique est valable légalement (eIDAS, Belgique).\n\nCaftanRH`;
    // Mail RH (toi)
    fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        template_params: {
          to_email: "elbazikarim@gmail.com",
          email: "elbazikarim@gmail.com",
          recipient: "elbazikarim@gmail.com",
          user_email: "elbazikarim@gmail.com",
          candidate_email: "elbazikarim@gmail.com",
          to: "elbazikarim@gmail.com",
          to_name: "Karim",
          name: "Karim",
          from_name: "CaftanRH",
          reply_to: "hr@caftanfactory.com",
          subject: subjectRH,
          message: bodyRH,
          html_message: bodyRH.replace(/\n/g, "<br>"),
          body: bodyRH,
          html: bodyRH.replace(/\n/g, "<br>"),
          content: bodyRH,
        },
      }),
    }).catch(() => {});

    // Karim 2026-06-15 : le mail employé « copie à suivre » ne livrait JAMAIS le
    // contrat. On l'envoie désormais RÉELLEMENT en pièce jointe (bloc ci-dessous).
  }

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
      await sendMailWithAttachments({
        to: employeeEmail,
        toName: employeeName,
        subject: `Ton contrat signé — ${docTitle2}`,
        body:
          `Bonjour ${employeeName.split(" ")[0]},\n\n` +
          `Ton ${docTitle2} est officiellement signé. ✅\n` +
          `Tu le trouveras en pièce jointe (avec les deux signatures) : ouvre-le pour le consulter, ` +
          `l'imprimer ou l'enregistrer en PDF. Conserve-le précieusement.\n\n` +
          `Bienvenue dans l'équipe !\n\nCaftanRH`,
        attachments: [
          {
            filename: `Contrat_signe_${slug}.html`,
            content: new TextEncoder().encode(signedBody),
            contentType: "text/html; charset=utf-8",
          },
        ],
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
