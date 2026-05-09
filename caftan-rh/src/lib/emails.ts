import { Resend } from "resend";
import { BRAND } from "@/lib/config";

function getClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const FROM = process.env.RESEND_FROM_EMAIL ?? "CaftanRH <onboarding@resend.dev>";

type SendArgs = { to: string; subject: string; html: string; replyTo?: string };

export async function sendEmail({ to, subject, html, replyTo }: SendArgs) {
  const resend = getClient();
  if (!resend) {
    console.warn("[emails] RESEND_API_KEY missing — email not sent:", subject);
    return { skipped: true };
  }
  const { error } = await resend.emails.send({
    from: FROM,
    to: [to],
    subject,
    html,
    replyTo,
  });
  if (error) {
    console.error("[emails] send error:", error.message);
    return { error: error.message };
  }
  return { ok: true };
}

function shell(title: string, content: string) {
  return `<!doctype html>
<html lang="fr"><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f6f2;margin:0;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">
    <div style="background:#18181b;padding:18px 24px">
      <div style="color:#c8a96e;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:12px">${BRAND.name}</div>
    </div>
    <div style="padding:24px;color:#18181b;line-height:1.6">
      <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
      ${content}
    </div>
    <div style="padding:14px 24px;background:#f0efe9;color:#a1a1aa;font-size:11px;text-align:center">
      ${BRAND.name} · email automatique, ne pas répondre
    </div>
  </div>
</body></html>`;
}

export function sendApplicationAcknowledgement(args: { to: string; fullName: string }) {
  return sendEmail({
    to: args.to,
    subject: `${BRAND.name} — Candidature bien reçue`,
    html: shell(
      `Merci ${args.fullName} 👋`,
      `<p>Nous avons bien reçu ta candidature. Notre équipe va l'examiner dans les meilleurs délais.</p>
       <p>Si ton profil correspond, nous te recontacterons par email pour planifier un entretien.</p>
       <p>Bonne journée,<br/>L'équipe ${BRAND.name}</p>`,
    ),
  });
}

export function sendInterviewInvite(args: { to: string; fullName: string; whenLocal: string; location: string }) {
  return sendEmail({
    to: args.to,
    subject: `${BRAND.name} — Convocation à un entretien`,
    html: shell(
      "Tu es convoqué·e à un entretien",
      `<p>Bonjour ${args.fullName},</p>
       <p>Nous serions ravis de te rencontrer pour un entretien.</p>
       <p><strong>Quand :</strong> ${args.whenLocal}<br/>
          <strong>Où :</strong> ${args.location}</p>
       <p>Réponds à cet email pour confirmer ta présence.</p>`,
    ),
  });
}

export function sendRejection(args: { to: string; fullName: string }) {
  return sendEmail({
    to: args.to,
    subject: `${BRAND.name} — Suite donnée à ta candidature`,
    html: shell(
      "Suite donnée à ta candidature",
      `<p>Bonjour ${args.fullName},</p>
       <p>Nous te remercions pour l'intérêt porté à ${BRAND.name}. Après examen, nous ne pourrons pas donner suite à ta candidature pour cette fois-ci.</p>
       <p>Nous te souhaitons plein de succès dans tes recherches.</p>`,
    ),
  });
}

export function sendOffer(args: { to: string; fullName: string; jobTitle: string }) {
  return sendEmail({
    to: args.to,
    subject: `${BRAND.name} — Bienvenue dans l'équipe !`,
    html: shell(
      "Bienvenue 🎉",
      `<p>Bonjour ${args.fullName},</p>
       <p>Nous avons le plaisir de te confirmer ton recrutement au poste de <strong>${args.jobTitle}</strong>.</p>
       <p>Notre équipe RH te recontactera très vite pour les prochaines étapes administratives.</p>`,
    ),
  });
}
