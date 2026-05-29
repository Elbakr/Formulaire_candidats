// Karim 2026-05-29 : webhook DocuSeal pour update le statut de signature
// dans CaftanRH. Configure dans DocuSeal Admin > Webhooks avec URL :
//   https://<domain>/api/docuseal/webhook
//   Events : form.completed, form.declined, form.signed
//   Secret : DOCUSEAL_WEBHOOK_SECRET

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyDocusealWebhook } from "@/lib/docuseal-client";

export const dynamic = "force-dynamic";

type DocusealEvent = {
  // form.* = action d un signer individuel
  // submission.* = etat global de l envelope (tous signers)
  event_type:
    | "form.viewed"
    | "form.started"
    | "form.completed"
    | "form.declined"
    | "submission.completed"
    | "submission.expired";
  timestamp: string;
  data: {
    id: number;
    submission_id?: number;
    template_id?: number;
    email?: string;
    status?: string;
    completed_at?: string;
    audit_log_url?: string;
    combined_document_url?: string;
    // Karim 2026-05-29 : DocuSeal stocke le PDF signe dans documents[0].url
    // (pas combined_document_url qui est souvent null)
    documents?: Array<{ name: string; url: string }>;
    metadata?: Record<string, string>;
  };
};

/**
 * Karim 2026-05-29 : recupere l URL du PDF signe. Priorite :
 * 1. documents[0].url (le contrat signe avec toutes les signatures)
 * 2. combined_document_url (legacy)
 * 3. fallback : refetch /submissions/{id} si besoin
 */
async function getSignedPdfUrl(data: DocusealEvent["data"]): Promise<string | null> {
  if (data.documents && data.documents.length > 0) return data.documents[0].url;
  if (data.combined_document_url) return data.combined_document_url;
  // Fallback : refetch
  const baseUrl = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
  const submissionId = data.submission_id ?? data.id;
  if (!baseUrl || !apiKey || !submissionId) return null;
  try {
    const res = await fetch(`${baseUrl}/submissions/${submissionId}`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!res.ok) return null;
    const body = await res.json() as { documents?: Array<{ url: string }>; combined_document_url?: string };
    if (body.documents && body.documents.length > 0) return body.documents[0].url;
    return body.combined_document_url ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = request.headers.get("x-docuseal-signature");

  // Verifie HMAC si secret configure (sinon ouvert - dev mode)
  if (process.env.DOCUSEAL_WEBHOOK_SECRET) {
    if (!verifyDocusealWebhook(sig, rawBody)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: DocusealEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const submissionId = event.data.submission_id ?? event.data.id;
  const employeeId = event.data.metadata?.employee_id;
  const contractId = event.data.metadata?.contract_id;

  if (event.event_type === "submission.completed") {
    // Tous les signers ont signe -> contrat 100% finalise
    const signedPdfUrl = await getSignedPdfUrl(event.data);
    if (contractId) {
      await admin
        .from("employee_contracts")
        .update({
          signed_at: event.data.completed_at ?? new Date().toISOString(),
          signed_pdf_url: signedPdfUrl,
          docuseal_submission_id: submissionId,
          docuseal_status: "completed",
        })
        .eq("id", contractId);
    }

    // Envoi du contrat signe final aux 2 parties
    if (employeeId && signedPdfUrl) {
      const { data: emp } = await admin
        .from("employees")
        .select("full_name, email, preferred_language")
        .eq("id", employeeId)
        .maybeSingle();
      const employee = (emp as { full_name?: string; email?: string; preferred_language?: string } | null);
      if (employee?.email) {
        await sendSignedContractCopy({
          to: employee.email,
          recipientName: employee.full_name ?? "Travailleur",
          signedPdfUrl,
          language: (employee.preferred_language === "nl" || employee.preferred_language === "en") ? employee.preferred_language : "fr",
        });
      }
      await sendSignedContractCopy({
        to: "hr@caftanfactory.com",
        recipientName: "HR Team",
        signedPdfUrl,
        language: "fr",
      });
    }
  } else if (event.event_type === "form.completed") {
    // Le contrat a ete signe - update employee_contracts
    if (contractId) {
      await admin
        .from("employee_contracts")
        .update({
          signed_at: event.data.completed_at ?? new Date().toISOString(),
          signed_pdf_url: event.data.combined_document_url,
          docuseal_submission_id: submissionId,
          docuseal_status: "completed",
        })
        .eq("id", contractId);
    }

    // Notification RH
    if (employeeId) {
      const { data: emp } = await admin
        .from("employees")
        .select("full_name")
        .eq("id", employeeId)
        .maybeSingle();
      const name = (emp as { full_name?: string } | null)?.full_name ?? "?";
      const { data: hrs } = await admin
        .from("profiles")
        .select("id")
        .in("role", ["admin", "rh"]);
      const hrIds = ((hrs ?? []) as Array<{ id: string }>).map((h) => h.id);
      if (hrIds.length > 0) {
        await admin.from("notifications").insert(
          hrIds.map((hrId) => ({
            recipient_id: hrId,
            kind: "contract_signed",
            title: `Contrat signé : ${name}`,
            body: `Le contrat de ${name} a été signé électroniquement via DocuSeal.`,
            link: contractId ? `/planning/employees/${employeeId}/contract` : `/planning/employees/${employeeId}`,
            data: { submissionId, employeeId, contractId },
          })),
        );
      }
    }
  } else if (event.event_type === "form.declined") {
    if (contractId) {
      await admin
        .from("employee_contracts")
        .update({
          docuseal_submission_id: submissionId,
          docuseal_status: "declined",
        })
        .eq("id", contractId);
    }
  }

  return NextResponse.json({ ok: true });
}

// Karim 2026-05-29 : envoi du contrat signe final via EmailJS depuis
// hr@caftanfactory.com. EmailJS ne gere pas les attachements PDF facilement,
// donc on envoie le LIEN vers le PDF signe (hebergee chez DocuSeal).
async function sendSignedContractCopy(args: {
  to: string;
  recipientName: string;
  signedPdfUrl: string;
  language: "fr" | "nl" | "en";
}) {
  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !PUBLIC_KEY) return;

  const MSG = {
    fr: {
      subject: "Votre contrat signé — Caftan Factory (By AMD Megastore)",
      body: (name: string, url: string) =>
        `Bonjour ${name},\n\nVotre contrat a été signé par toutes les parties. ` +
        `Vous pouvez le télécharger ici :\n\n👉 ${url}\n\n` +
        `Conservez précieusement ce document — il fait office d'original.\n\n` +
        `Bien à vous,\nL'équipe Caftan Factory (By AMD Megastore)`,
    },
    nl: {
      subject: "Uw ondertekende overeenkomst — Caftan Factory (By AMD Megastore)",
      body: (name: string, url: string) =>
        `Beste ${name},\n\nUw overeenkomst werd door alle partijen ondertekend. ` +
        `U kan ze hier downloaden:\n\n👉 ${url}\n\n` +
        `Bewaar dit document zorgvuldig — het geldt als origineel.\n\n` +
        `Met vriendelijke groet,\nHet Caftan Factory team (By AMD Megastore)`,
    },
    en: {
      subject: "Your signed contract — Caftan Factory (By AMD Megastore)",
      body: (name: string, url: string) =>
        `Hello ${name},\n\nYour contract has been signed by all parties. ` +
        `You can download it here:\n\n👉 ${url}\n\n` +
        `Keep this document safely — it serves as the original.\n\n` +
        `Best regards,\nThe Caftan Factory team (By AMD Megastore)`,
    },
  } as const;

  const msg = MSG[args.language];
  const firstName = args.recipientName.split(/\s+/)[0] ?? args.recipientName;
  const body = msg.body(firstName, args.signedPdfUrl);
  const params = {
    to_email: args.to, email: args.to, user_email: args.to, candidate_email: args.to,
    to: args.to, to_name: args.recipientName, name: args.recipientName, candidate_name: args.recipientName,
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject: msg.subject, message: body, html_message: body.replace(/\n/g, "<br>"),
    body, html: body.replace(/\n/g, "<br>"), content: body,
    signed_pdf_url: args.signedPdfUrl,
  };
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({
        service_id: SERVICE, template_id: TEMPLATE, user_id: PUBLIC_KEY, template_params: params,
      }),
    });
  } catch (e) {
    console.warn("[docuseal/webhook] sendSignedContractCopy err:", e);
  }
}
