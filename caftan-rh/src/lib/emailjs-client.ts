/**
 * Karim 19/05 : remplace les `mailto:` qui ouvraient Outlook par un envoi
 * direct via EmailJS REST (cote client, env vars NEXT_PUBLIC_*). Tout passe
 * desormais par la messagerie integree -- pas de client mail tiers.
 *
 * Karim 2026-06-07 : ajoute un log best-effort dans outbound_mails APRES
 * envoi, mais uniquement cote serveur (dynamic import de @/lib/outbound-mails-log
 * conditionne par typeof window === "undefined"). Cote client, le log est
 * skip silencieusement -- les envois client-side ne sont donc pas traces.
 * Pour tracer cote client, utiliser une server action au lieu d'un appel direct.
 *
 * Utilisation :
 *   const ok = await sendEmailViaEmailJS({
 *     to_email, to_name, subject, body_text,
 *     reply_to: "hr@caftanfactory.com",
 *     source: "info-request",
 *     sourceRef: candidateId,
 *   });
 */

export type EmailJSPayload = {
  to_email: string;
  to_name?: string;
  subject: string;
  /** Texte brut. Sera converti en HTML auto (newlines -> <br>). */
  body_text: string;
  reply_to?: string;
  from_name?: string;
  /** Karim 2026-06-07 : metadata pour le journal outbound_mails */
  source?: string;
  sourceRef?: string;
  candidateId?: string;
  employeeId?: string;
};

async function logIfServer(input: {
  to: string;
  recipientName?: string;
  subject: string;
  bodyText: string;
  source: string;
  sourceRef?: string;
  candidateId?: string;
  employeeId?: string;
  status: "sent" | "failed";
  errorMessage?: string;
}): Promise<void> {
  if (typeof window !== "undefined") return;
  try {
    const mod = await import("@/lib/outbound-mails-log");
    await mod.logOutboundMail({
      to: input.to,
      recipientName: input.recipientName,
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml: input.bodyText.replace(/\n/g, "<br>"),
      source: input.source,
      sourceRef: input.sourceRef,
      candidateId: input.candidateId,
      employeeId: input.employeeId,
      deliveryProvider: "emailjs",
      status: input.status,
      errorMessage: input.errorMessage,
    });
  } catch {
    // silent
  }
}

export async function sendEmailViaEmailJS(p: EmailJSPayload): Promise<{
  ok: boolean;
  error?: string;
}> {
  const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  const source = p.source ?? "emailjs-direct";

  if (!serviceId || !templateId || !publicKey) {
    await logIfServer({
      to: p.to_email,
      recipientName: p.to_name,
      subject: p.subject,
      bodyText: p.body_text,
      source,
      sourceRef: p.sourceRef,
      candidateId: p.candidateId,
      employeeId: p.employeeId,
      status: "failed",
      errorMessage: "EmailJS non configure (env NEXT_PUBLIC_EMAILJS_*)",
    });
    return { ok: false, error: "EmailJS non configure (env NEXT_PUBLIC_EMAILJS_*)" };
  }
  const params = {
    to_email: p.to_email,
    email: p.to_email,
    user_email: p.to_email,
    candidate_email: p.to_email,
    to: p.to_email,
    to_name: p.to_name ?? "",
    name: p.to_name ?? "",
    candidate_name: p.to_name ?? "",
    from_name: p.from_name ?? "Caftan Factory",
    reply_to: p.reply_to ?? "hr@caftanfactory.com",
    subject: p.subject,
    message: p.body_text,
    html_message: p.body_text.replace(/\n/g, "<br>"),
    body: p.body_text,
    html: p.body_text.replace(/\n/g, "<br>"),
    content: p.body_text,
  };
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: params,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const errMsg = `EmailJS HTTP ${res.status} ${body.slice(0, 200)}`;
      await logIfServer({
        to: p.to_email,
        recipientName: p.to_name,
        subject: p.subject,
        bodyText: p.body_text,
        source,
        sourceRef: p.sourceRef,
        candidateId: p.candidateId,
        employeeId: p.employeeId,
        status: "failed",
        errorMessage: errMsg,
      });
      return { ok: false, error: errMsg };
    }
    await logIfServer({
      to: p.to_email,
      recipientName: p.to_name,
      subject: p.subject,
      bodyText: p.body_text,
      source,
      sourceRef: p.sourceRef,
      candidateId: p.candidateId,
      employeeId: p.employeeId,
      status: "sent",
    });
    return { ok: true };
  } catch (e) {
    const errMsg = `Envoi impossible : ${(e as Error).message}`;
    await logIfServer({
      to: p.to_email,
      recipientName: p.to_name,
      subject: p.subject,
      bodyText: p.body_text,
      source,
      sourceRef: p.sourceRef,
      candidateId: p.candidateId,
      employeeId: p.employeeId,
      status: "failed",
      errorMessage: errMsg,
    });
    return { ok: false, error: errMsg };
  }
}
