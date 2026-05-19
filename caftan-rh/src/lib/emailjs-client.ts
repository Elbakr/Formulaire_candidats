/**
 * Karim 19/05 : remplace les `mailto:` qui ouvraient Outlook par un envoi
 * direct via EmailJS REST (cote client, env vars NEXT_PUBLIC_*). Tout passe
 * desormais par la messagerie integree -- pas de client mail tiers.
 *
 * Utilisation :
 *   const ok = await sendEmailViaEmailJS({
 *     to_email, to_name, subject, body_text,
 *     reply_to: "hr@caftanfactory.com",
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
};

export async function sendEmailViaEmailJS(p: EmailJSPayload): Promise<{
  ok: boolean;
  error?: string;
}> {
  const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!serviceId || !templateId || !publicKey) {
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
      return { ok: false, error: `EmailJS HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Envoi impossible : ${(e as Error).message}` };
  }
}
