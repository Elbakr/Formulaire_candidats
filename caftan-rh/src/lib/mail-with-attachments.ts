// Karim 2026-06-02 : helper SERVER-ONLY pour envoyer un mail AVEC pieces
// jointes PDF natives. Utilise Resend en priorite (supporte attachments
// base64), fallback EmailJS avec liens si Resend pas configure.

import "server-only";

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
}

export interface SendMailResult {
  ok: boolean;
  provider: "resend" | "emailjs" | "none";
  error?: string;
  messageId?: string;
}

/**
 * Karim 2026-06-02 : envoie via Resend si RESEND_API_KEY configure
 * (pieces jointes natives), sinon EmailJS avec liens.
 */
export async function sendMailWithAttachments(opts: SendMailOptions): Promise<SendMailResult> {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? "CaftanRH <onboarding@resend.dev>";
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  const htmlBody = opts.htmlBody ?? opts.body.replace(/\n/g, "<br>");

  // === PATH 1 : Resend (pieces jointes natives) ===
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
        // Fallback EmailJS si Resend echoue
      } else {
        const data = await res.json() as { id?: string };
        return { ok: true, provider: "resend", messageId: data.id };
      }
    } catch (e) {
      console.warn("[mail] Resend exception:", (e as Error).message);
    }
  }

  // === PATH 2 : EmailJS (fallback, avec liens dans le body) ===
  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!SERVICE || !TEMPLATE || !KEY) {
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
      if (res.ok) sent.push(to);
    } catch (e) {
      console.warn("[mail] EmailJS exception:", (e as Error).message);
    }
  }

  if (sent.length === 0) return { ok: false, provider: "emailjs", error: "Tous les envois EmailJS ont échoué" };
  return { ok: true, provider: "emailjs" };
}
