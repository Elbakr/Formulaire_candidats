"use server";

// Karim 2026-05-22 : finalisation signature. Stocke la signature PNG, marque
// le contrat signed, envoie un mail au RH (Karim) + a l employe avec le
// contrat sign en texte. La generation PDF complete est faite en arrière-plan
// (lib pdf-lib via /api/contracts/[id]/pdf).

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

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

  // Update status
  const nowISO = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("employee_contracts")
    .update({
      status: "signed",
      signed_at: nowISO,
      signed_ip: ip,
      employee_signature_png: input.signaturePng,
    })
    .eq("id", input.contractId);
  if (updErr) return { error: updErr.message };

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

    // Mail employe (si email connu)
    if (employeeEmail) {
      const subjectEmp = `Ton contrat signé — ${docTitle}`;
      const bodyEmp = `Bonjour ${employeeName.split(" ")[0]},\n\nTon ${docTitle} est officiellement signé. Voici un récapitulatif :\n\nSigné le : ${new Date(nowISO).toLocaleString("fr-BE")}\nDocument :\n\n${(contract.rendered_body ?? "").replace(/[#*]/g, "")}\n\n---\nCaftanRH`;
      fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify({
          service_id: SERVICE_ID,
          template_id: TEMPLATE_ID,
          user_id: PUBLIC_KEY,
          template_params: {
            to_email: employeeEmail,
            email: employeeEmail,
            recipient: employeeEmail,
            user_email: employeeEmail,
            candidate_email: employeeEmail,
            to: employeeEmail,
            to_name: employeeName,
            name: employeeName,
            from_name: "CaftanRH",
            reply_to: "hr@caftanfactory.com",
            subject: subjectEmp,
            message: bodyEmp,
            html_message: bodyEmp.replace(/\n/g, "<br>"),
            body: bodyEmp,
            html: bodyEmp.replace(/\n/g, "<br>"),
            content: bodyEmp,
          },
        }),
      }).catch(() => {});
    }
  }

  return { ok: true };
}
