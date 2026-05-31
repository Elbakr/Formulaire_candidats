// Karim 2026-05-29 : envoi d emails depuis hr@caftanfactory.com via EmailJS.
// Utilise les vars NEXT_PUBLIC_EMAILJS_* deja configurees pour l envoi
// des autres mails. Pattern : from_name personnalise + reply_to fixe sur
// hr@caftanfactory.com (deja approuve par Karim).

import type { ContractLang } from "./docuseal-flow";

const EMAILJS_API = "https://api.emailjs.com/api/v1.0/email/send";

const SIGN_MESSAGES = {
  fr: {
    subject: (org: string) => `Bienvenue chez ${org} — Votre contrat à signer`,
    body: (employeeFirstName: string, employerName: string, signingUrl: string) =>
      `Bonjour ${employeeFirstName},\n\n` +
      `Nous vous souhaitons la bienvenue dans l'équipe ${employerName} !\n\n` +
      `Votre contrat de travail est prêt et a déjà été signé par notre direction. ` +
      `Il ne vous reste plus qu'à le signer électroniquement en cliquant sur le lien sécurisé ci-dessous :\n\n` +
      `👉 ${signingUrl}\n\n` +
      `Une fois signé, vous recevrez automatiquement une copie complète du contrat par mail.\n\n` +
      `Si vous avez la moindre question, répondez simplement à ce mail.\n\n` +
      `Bien à vous,\n` +
      `L'équipe Caftan Factory (By AMD Megastore)`,
  },
  nl: {
    subject: (org: string) => `Welkom bij ${org} — Uw te ondertekenen overeenkomst`,
    body: (employeeFirstName: string, employerName: string, signingUrl: string) =>
      `Beste ${employeeFirstName},\n\n` +
      `Welkom bij het team van ${employerName}!\n\n` +
      `Uw arbeidsovereenkomst is klaar en werd reeds door onze directie ondertekend. ` +
      `U hoeft hem nog enkel elektronisch te ondertekenen via onderstaande beveiligde link:\n\n` +
      `👉 ${signingUrl}\n\n` +
      `Eenmaal ondertekend ontvangt u automatisch een volledig exemplaar van de overeenkomst per mail.\n\n` +
      `Aarzel niet om op deze mail te antwoorden bij vragen.\n\n` +
      `Met vriendelijke groet,\n` +
      `Het Caftan Factory team (By AMD Megastore)`,
  },
  en: {
    subject: (org: string) => `Welcome to ${org} — Your contract to sign`,
    body: (employeeFirstName: string, employerName: string, signingUrl: string) =>
      `Hello ${employeeFirstName},\n\n` +
      `Welcome to the ${employerName} team!\n\n` +
      `Your employment contract is ready and has already been signed by our management. ` +
      `All you need to do now is sign it electronically by clicking the secure link below:\n\n` +
      `👉 ${signingUrl}\n\n` +
      `Once signed, you will automatically receive a full copy of the contract by email.\n\n` +
      `If you have any questions, just reply to this email.\n\n` +
      `Best regards,\n` +
      `The Caftan Factory team (By AMD Megastore)`,
  },
} as const;

/**
 * Envoie le mail "votre contrat à signer" depuis hr@caftanfactory.com a
 * l employee, avec lien DocuSeal de signature et bienvenue dans sa langue.
 */
export async function sendContractSignatureMail(args: {
  employeeName: string;
  employeeEmail: string;
  signingUrl: string;
  employerName: string;
  language: ContractLang;
  // Karim 2026-05-30 : body personnalisé éditable depuis la modale.
  // Variables {first_name}, {employer_name}, {signing_url} sont remplacées.
  customBody?: string;
}): Promise<{ ok?: true; error?: string }> {
  const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!serviceId || !templateId || !publicKey) {
    return { error: "EmailJS non configure (NEXT_PUBLIC_EMAILJS_*)" };
  }

  const lang: ContractLang = args.language ?? "fr";
  const msg = SIGN_MESSAGES[lang];
  const firstName = args.employeeName.split(/\s+/)[0] ?? args.employeeName;
  const subject = msg.subject(args.employerName);
  // Karim 2026-05-30 : custom body si fourni par la modale, sinon default
  const body = args.customBody
    ? args.customBody
        .replaceAll("{first_name}", firstName)
        .replaceAll("{employer_name}", args.employerName)
        .replaceAll("{signing_url}", args.signingUrl)
    : msg.body(firstName, args.employerName, args.signingUrl);

  const params = {
    to_email: args.employeeEmail,
    email: args.employeeEmail,
    user_email: args.employeeEmail,
    candidate_email: args.employeeEmail,
    to: args.employeeEmail,
    to_name: args.employeeName,
    name: args.employeeName,
    candidate_name: args.employeeName,
    // Karim 2026-05-29 : branding unifie "Caftan Factory (By AMD Megastore)"
    from_name: "Caftan Factory (By AMD Megastore)",
    reply_to: "hr@caftanfactory.com",
    subject,
    message: body,
    html_message: body.replace(/\n/g, "<br>"),
    body,
    html: body.replace(/\n/g, "<br>"),
    content: body,
    signing_url: args.signingUrl,
  };

  try {
    const res = await fetch(EMAILJS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: params,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { error: `EmailJS HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
