import { Resend } from "resend";
import { BRAND } from "@/lib/config";
import { logOutboundMail } from "@/lib/outbound-mails-log";
import { isAutoOutboundBlocked, reportBlockedOutbound } from "@/lib/outbound-guard";

function getClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const FROM = process.env.RESEND_FROM_EMAIL ?? "CaftanRH <onboarding@resend.dev>";

// Karim 2026-06-07 : source/refs optionnels pour le journal outbound_mails.
// Default source = "resend-direct" si le caller ne precise pas.
type SendArgs = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  source?: string;
  sourceRef?: string;
  recipientName?: string;
  candidateId?: string;
  employeeId?: string;
  // Karim 2026-07-02 : true = outreach AUTOMATIQUE → soumis au kill-switch.
  automated?: boolean;
};

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  source = "resend-direct",
  sourceRef,
  recipientName,
  candidateId,
  employeeId,
  automated,
}: SendArgs) {
  // Karim 2026-07-02 : kill-switch outreach auto vers candidat/travailleur.
  if (await isAutoOutboundBlocked(automated)) {
    await reportBlockedOutbound({ to, toName: recipientName, subject, source, candidateId, employeeId });
    return { skipped: true, blocked: true };
  }

  const resend = getClient();
  if (!resend) {
    console.warn("[emails] RESEND_API_KEY missing — email not sent:", subject);
    await logOutboundMail({
      to,
      recipientName,
      subject,
      bodyHtml: html,
      source,
      sourceRef,
      deliveryProvider: "none",
      status: "failed",
      errorMessage: "RESEND_API_KEY missing",
      candidateId,
      employeeId,
    });
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
    await logOutboundMail({
      to,
      recipientName,
      subject,
      bodyHtml: html,
      source,
      sourceRef,
      deliveryProvider: "resend",
      status: "failed",
      errorMessage: error.message,
      candidateId,
      employeeId,
    });
    return { error: error.message };
  }
  await logOutboundMail({
    to,
    recipientName,
    subject,
    bodyHtml: html,
    source,
    sourceRef,
    deliveryProvider: "resend",
    status: "sent",
    candidateId,
    employeeId,
  });
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

export function sendApplicationAcknowledgement(args: { to: string; fullName: string; candidateId?: string }) {
  return sendEmail({
    to: args.to,
    recipientName: args.fullName,
    candidateId: args.candidateId,
    source: "application-ack",
    sourceRef: args.candidateId,
    subject: `${BRAND.name} — Candidature bien reçue`,
    html: shell(
      `Merci ${args.fullName} 👋`,
      `<p>Nous avons bien reçu ta candidature. Notre équipe va l'examiner dans les meilleurs délais.</p>
       <p>Si ton profil correspond, nous te recontacterons par email pour planifier un entretien.</p>
       <p>Bonne journée,<br/>L'équipe ${BRAND.name}</p>`,
    ),
  });
}

export function sendInterviewInvite(args: { to: string; fullName: string; whenLocal: string; location: string; candidateId?: string }) {
  return sendEmail({
    to: args.to,
    recipientName: args.fullName,
    candidateId: args.candidateId,
    automated: true,
    source: "interview-invite",
    sourceRef: args.candidateId,
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

const TYPE_LABEL_FR: Record<string, string> = {
  phone: "entretien téléphonique",
  video: "entretien en visioconférence",
  onsite: "entretien sur place",
};
const TYPE_LABEL_NL: Record<string, string> = {
  phone: "telefonisch interview",
  video: "video-interview",
  onsite: "interview ter plaatse",
};

/** Mail de CONFIRMATION envoyé immédiatement après la planification de l'entretien. */
export function sendInterviewConfirmation(args: {
  to: string;
  fullName: string;
  whenLocal: string;
  whenLocalNl: string;
  location: string;
  type: string;
  durationMin: number;
  candidateId?: string;
  interviewId?: string;
}) {
  const typeFr = TYPE_LABEL_FR[args.type] ?? "entretien";
  const typeNl = TYPE_LABEL_NL[args.type] ?? "interview";
  return sendEmail({
    to: args.to,
    recipientName: args.fullName,
    candidateId: args.candidateId,
    source: "interview-confirmation",
    sourceRef: args.interviewId ?? args.candidateId,
    subject: `${BRAND.name} — Confirmation de ton entretien / Bevestiging van jouw interview`,
    html: shell(
      "Entretien confirmé / Interview bevestigd",
      `<p>Bonjour ${args.fullName},</p>
       <p>Voici la confirmation de ton ${typeFr} chez ${BRAND.name}.</p>
       <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0">
         <tr><td style="padding:6px 0;color:#71717a;width:120px">Date &amp; heure</td><td style="padding:6px 0;font-weight:600">${args.whenLocal}</td></tr>
         <tr><td style="padding:6px 0;color:#71717a">Type</td><td style="padding:6px 0;font-weight:600">${typeFr} (${args.durationMin} min)</td></tr>
         <tr><td style="padding:6px 0;color:#71717a">Lieu / Lien</td><td style="padding:6px 0;font-weight:600">${args.location}</td></tr>
       </table>
       <p>Si tu ne peux pas te présenter, réponds à cet email le plus tôt possible.</p>
       <hr style="border:none;border-top:1px solid #e4e4e7;margin:18px 0"/>
       <p style="color:#71717a;font-size:13px">Hallo ${args.fullName},</p>
       <p style="color:#71717a;font-size:13px">Hierbij de bevestiging van jouw ${typeNl} bij ${BRAND.name}.</p>
       <table style="border-collapse:collapse;width:100%;font-size:13px;margin:8px 0;color:#71717a">
         <tr><td style="padding:4px 0;width:120px">Datum &amp; tijd</td><td style="padding:4px 0;font-weight:600">${args.whenLocalNl}</td></tr>
         <tr><td style="padding:4px 0">Type</td><td style="padding:4px 0;font-weight:600">${typeNl} (${args.durationMin} min)</td></tr>
         <tr><td style="padding:4px 0">Locatie / Link</td><td style="padding:4px 0;font-weight:600">${args.location}</td></tr>
       </table>
       <p style="color:#71717a;font-size:13px">Kan je niet aanwezig zijn? Antwoord dan zo snel mogelijk op deze e-mail.</p>`,
    ),
  });
}

/** Mail de RAPPEL envoyé ~24 h avant l'entretien. */
export function sendInterviewReminder(args: {
  to: string;
  fullName: string;
  whenLocal: string;
  whenLocalNl: string;
  location: string;
  type: string;
  durationMin: number;
  candidateId?: string;
  interviewId?: string;
}) {
  const typeFr = TYPE_LABEL_FR[args.type] ?? "entretien";
  const typeNl = TYPE_LABEL_NL[args.type] ?? "interview";
  return sendEmail({
    to: args.to,
    recipientName: args.fullName,
    candidateId: args.candidateId,
    automated: true,
    source: "interview-reminder",
    sourceRef: args.interviewId ?? args.candidateId,
    subject: `${BRAND.name} — Rappel : ton entretien demain / Herinnering: jouw interview morgen`,
    html: shell(
      "Rappel entretien / Herinnering interview",
      `<p>Bonjour ${args.fullName},</p>
       <p>Ton ${typeFr} chez ${BRAND.name} a lieu <strong>demain</strong>.</p>
       <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0">
         <tr><td style="padding:6px 0;color:#71717a;width:120px">Date &amp; heure</td><td style="padding:6px 0;font-weight:600">${args.whenLocal}</td></tr>
         <tr><td style="padding:6px 0;color:#71717a">Type</td><td style="padding:6px 0;font-weight:600">${typeFr} (${args.durationMin} min)</td></tr>
         <tr><td style="padding:6px 0;color:#71717a">Lieu / Lien</td><td style="padding:6px 0;font-weight:600">${args.location}</td></tr>
       </table>
       <p>À demain ! Si tu as un empêchement de dernière minute, contacte-nous immédiatement en répondant à cet email.</p>
       <hr style="border:none;border-top:1px solid #e4e4e7;margin:18px 0"/>
       <p style="color:#71717a;font-size:13px">Hallo ${args.fullName},</p>
       <p style="color:#71717a;font-size:13px">Jouw ${typeNl} bij ${BRAND.name} vindt <strong>morgen</strong> plaats.</p>
       <table style="border-collapse:collapse;width:100%;font-size:13px;margin:8px 0;color:#71717a">
         <tr><td style="padding:4px 0;width:120px">Datum &amp; tijd</td><td style="padding:4px 0;font-weight:600">${args.whenLocalNl}</td></tr>
         <tr><td style="padding:4px 0">Type</td><td style="padding:4px 0;font-weight:600">${typeNl} (${args.durationMin} min)</td></tr>
         <tr><td style="padding:4px 0">Locatie / Link</td><td style="padding:4px 0;font-weight:600">${args.location}</td></tr>
       </table>
       <p style="color:#71717a;font-size:13px">Tot morgen! Als je verhinderd bent, neem dan zo snel mogelijk contact met ons op door op deze e-mail te antwoorden.</p>`,
    ),
  });
}

export function sendRejection(args: { to: string; fullName: string; candidateId?: string }) {
  return sendEmail({
    to: args.to,
    recipientName: args.fullName,
    candidateId: args.candidateId,
    automated: true,
    source: "rejection",
    sourceRef: args.candidateId,
    subject: `${BRAND.name} — Suite donnée à ta candidature`,
    html: shell(
      "Suite donnée à ta candidature",
      `<p>Bonjour ${args.fullName},</p>
       <p>Nous te remercions pour l'intérêt porté à ${BRAND.name}. Après examen, nous ne pourrons pas donner suite à ta candidature pour cette fois-ci.</p>
       <p>Nous te souhaitons plein de succès dans tes recherches.</p>`,
    ),
  });
}

export function sendOffer(args: { to: string; fullName: string; jobTitle: string; candidateId?: string; employeeId?: string }) {
  return sendEmail({
    to: args.to,
    recipientName: args.fullName,
    candidateId: args.candidateId,
    employeeId: args.employeeId,
    automated: true,
    source: "offer",
    sourceRef: args.employeeId ?? args.candidateId,
    subject: `${BRAND.name} — Bienvenue dans l'équipe !`,
    html: shell(
      "Bienvenue 🎉",
      `<p>Bonjour ${args.fullName},</p>
       <p>Nous avons le plaisir de te confirmer ton recrutement au poste de <strong>${args.jobTitle}</strong>.</p>
       <p>Notre équipe RH te recontactera très vite pour les prochaines étapes administratives.</p>`,
    ),
  });
}
