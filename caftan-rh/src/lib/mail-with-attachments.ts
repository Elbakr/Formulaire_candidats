// Karim 2026-06-02 : helper SERVER-ONLY pour envoyer un mail AVEC pieces
// jointes PDF natives. Utilise Resend en priorite (supporte attachments
// base64), fallback SMTP Gmail (Nodemailer), puis EmailJS avec liens si
// rien d'autre n'est configure.
//
// Karim 2026-06-07 : journalise chaque envoi (succes ou echec) dans la
// table outbound_mails via logOutboundMail (best-effort, ne fait jamais
// echouer l'envoi). Source par defaut = "mail-attachments-generic" si le
// caller ne precise pas.

import "server-only";
import {
  logOutboundMail,
  type OutboundMailAttachmentMeta,
  type OutboundMailProvider,
} from "@/lib/outbound-mails-log";

export interface MailAttachment {
  filename: string;
  content: Uint8Array;  // bytes du PDF (ou autre)
  contentType?: string;  // default application/pdf
}

export interface SendMailOptions {
  to: string | string[];
  toName?: string;
  subject: string;
  body: string;             // plain text
  htmlBody?: string;        // HTML version (auto-genere si absent)
  replyTo?: string;
  attachments?: MailAttachment[];
  // Fallback : URL des PDFs si Resend KO et qu'on bascule EmailJS
  attachmentUrls?: Array<{ name: string; url: string }>;
  // Karim 2026-06-02 : copie systematique a hr@caftanfactory.com pour
  // archivage boite commune. Resend/SMTP supportent bcc, EmailJS non
  // (on fait un 2e envoi explicite).
  bccHr?: boolean;
  // Karim 2026-06-07 : metadata pour le journal outbound_mails
  source?: string;
  sourceRef?: string;
  candidateId?: string;
  employeeId?: string;
}

export interface SendMailResult {
  ok: boolean;
  provider: "resend" | "smtp_gmail" | "emailjs" | "none";
  error?: string;
  messageId?: string;
}

function buildAttachmentMeta(opts: SendMailOptions): OutboundMailAttachmentMeta[] {
  const native = (opts.attachments ?? []).map((a) => ({
    filename: a.filename,
    size: a.content.byteLength,
    contentType: a.contentType ?? "application/pdf",
  }));
  const links = (opts.attachmentUrls ?? []).map((a) => ({
    filename: a.name,
    contentType: "url",
  }));
  return [...native, ...links];
}

async function logSend(
  opts: SendMailOptions,
  provider: OutboundMailProvider,
  status: "sent" | "failed",
  errorMessage?: string,
  bodyHtml?: string,
): Promise<void> {
  await logOutboundMail({
    to: opts.to,
    recipientName: opts.toName,
    subject: opts.subject,
    bodyText: opts.body,
    bodyHtml: bodyHtml ?? opts.htmlBody,
    attachments: buildAttachmentMeta(opts),
    source: opts.source ?? "mail-attachments-generic",
    sourceRef: opts.sourceRef,
    candidateId: opts.candidateId,
    employeeId: opts.employeeId,
    deliveryProvider: provider,
    status,
    errorMessage: errorMessage ?? null,
  });
}

/**
 * Karim 2026-06-02 : envoie via Resend si RESEND_API_KEY configure
 * (pieces jointes natives), sinon SMTP Gmail, sinon EmailJS avec liens.
 */
export async function sendMailWithAttachments(opts: SendMailOptions): Promise<SendMailResult> {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? "CaftanRH <onboarding@resend.dev>";
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  const htmlBody = opts.htmlBody ?? opts.body.replace(/\n/g, "<br>");

  // Karim 2026-06-15 : PRIORITÉ GMAIL. Ordre demandé : Gmail SMTP (primaire) ->
  // Resend (secours, PJ natives) -> EmailJS (dernier secours, liens).

  // === PATH 1 : SMTP Gmail via Nodemailer (PJ natives) — PRIMAIRE ===
  // App Password Google : https://myaccount.google.com/apppasswords (necessite 2FA)
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  if (GMAIL_USER && GMAIL_APP_PASSWORD && GMAIL_USER.trim() && GMAIL_APP_PASSWORD.trim()) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      });
      const info = await transporter.sendMail({
        from: `Caftan Factory (By AMD Megastore) <${GMAIL_USER}>`,
        to: recipients.join(", "),
        bcc: opts.bccHr ? "hr@caftanfactory.com" : undefined,
        replyTo: opts.replyTo ?? "hr@caftanfactory.com",
        subject: opts.subject,
        text: opts.body,
        html: htmlBody,
        attachments: (opts.attachments ?? []).map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content),
          contentType: a.contentType ?? "application/pdf",
        })),
      });
      await logSend(opts, "smtp_gmail", "sent", undefined, htmlBody);
      return { ok: true, provider: "smtp_gmail", messageId: info.messageId };
    } catch (e) {
      console.warn("[mail] SMTP Gmail exception:", (e as Error).message);
      await logSend(opts, "smtp_gmail", "failed", `SMTP exception: ${(e as Error).message}`, htmlBody);
      // fallback Resend / EmailJS
    }
  }

  // === PATH 2 : Resend (pieces jointes natives) — SECOURS ===
  if (RESEND_KEY && RESEND_KEY.trim().length > 0) {
    try {
      const attachments = (opts.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString("base64"),
        contentType: a.contentType ?? "application/pdf",
      }));

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: recipients,
          bcc: opts.bccHr ? ["hr@caftanfactory.com"] : undefined,
          subject: opts.subject,
          text: opts.body,
          html: htmlBody,
          reply_to: opts.replyTo ?? "hr@caftanfactory.com",
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.warn("[mail] Resend HTTP", res.status, txt);
        await logSend(opts, "resend", "failed", `Resend HTTP ${res.status}`, htmlBody);
        // Fallback EmailJS si Resend echoue
      } else {
        const data = await res.json() as { id?: string };
        await logSend(opts, "resend", "sent", undefined, htmlBody);
        return { ok: true, provider: "resend", messageId: data.id };
      }
    } catch (e) {
      console.warn("[mail] Resend exception:", (e as Error).message);
      await logSend(opts, "resend", "failed", `Resend exception: ${(e as Error).message}`, htmlBody);
    }
  }

  // === PATH 3 : EmailJS (dernier fallback, avec liens dans le body) ===
  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) {
    await logSend(opts, "none", "failed", "Ni Resend ni SMTP Gmail ni EmailJS configures", htmlBody);
    return { ok: false, provider: "none", error: "Ni Resend ni EmailJS configures" };
  }

  // EmailJS sans attachements binaires : on embed les URLs dans le body si fournis
  let bodyEnriched = opts.body;
  let htmlEnriched = htmlBody;
  if (opts.attachmentUrls && opts.attachmentUrls.length > 0) {
    const linksText = opts.attachmentUrls.map((a) => `• ${a.name} : ${a.url}`).join("\n");
    bodyEnriched = `${opts.body}\n\n📎 Pièces jointes (liens sécurisés) :\n${linksText}`;
    const linksHtml = opts.attachmentUrls.map((a) => `• <a href="${a.url}">${a.name}</a>`).join("<br>");
    htmlEnriched = `${htmlBody}<br><br><strong>📎 Pièces jointes (liens sécurisés) :</strong><br>${linksHtml}`;
  }

  const sent: string[] = [];
  const failed: Array<{ to: string; err: string }> = [];
  for (const to of recipients) {
    const params = {
      to_email: to, email: to, user_email: to, candidate_email: to,
      to, to_name: opts.toName ?? to, name: opts.toName ?? to, candidate_name: opts.toName ?? to,
      from_name: "Caftan Factory (By AMD Megastore)",
      reply_to: opts.replyTo ?? "hr@caftanfactory.com",
      subject: opts.subject,
      message: bodyEnriched,
      html_message: htmlEnriched,
      body: bodyEnriched,
      content: bodyEnriched,
      html: htmlEnriched,
      pdf_url: opts.attachmentUrls?.[0]?.url ?? "",
    };
    try {
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
      });
      if (res.ok) {
        sent.push(to);
      } else {
        const errBody = await res.text().catch(() => "");
        failed.push({ to, err: `HTTP ${res.status} ${errBody.slice(0, 100)}` });
      }
    } catch (e) {
      console.warn("[mail] EmailJS exception:", (e as Error).message);
      failed.push({ to, err: (e as Error).message });
    }
  }

  // Log par destinataire : 1 ligne par to avec son statut individuel
  for (const to of sent) {
    await logSend({ ...opts, to }, "emailjs", "sent", undefined, htmlEnriched);
  }
  for (const { to, err } of failed) {
    await logSend({ ...opts, to }, "emailjs", "failed", err, htmlEnriched);
  }

  if (sent.length === 0) return { ok: false, provider: "emailjs", error: "Tous les envois EmailJS ont échoué" };
  return { ok: true, provider: "emailjs" };
}
