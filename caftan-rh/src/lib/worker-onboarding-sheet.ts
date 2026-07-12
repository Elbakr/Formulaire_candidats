// Karim 2026-07-06 : FICHE EXPLICATIVE d'onboarding envoyée AUTOMATIQUEMENT au
// nouveau travailleur ~15 min APRÈS qu'il a rempli son questionnaire d'accueil
// (pre_interviews context='onboarding', status='completed'). Remerciement + les
// essentiels pour bien démarrer sa première journée « presque au niveau des
// collègues ».
//
// Envoi AUTOMATIQUE assumé par Karim (comme le mail de bienvenue) : source
// `worker_onboarding_sheet` ajoutée à la liste blanche du kill-switch
// (outbound-guard.ts). Best-effort : ne throw JAMAIS, ne bloque rien.
//
// Le déclenchement (fenêtre 15 min, anti-doublon global) est piloté par le cron
// /api/cron/onboarding-sheet ; cette fonction protège quand même l'anti-doublon
// pour rester ré-entrante (double appel = un seul mail).

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureReportToken, signalerPublicUrl } from "@/lib/worker-reports";

const SOURCE = "worker_onboarding_sheet";

function firstNameOf(fullName: string | null | undefined): string {
  const n = (fullName ?? "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** FR par défaut ; NL uniquement si la locale commence par « nl ». */
function pickLang(languageCode: string | null | undefined): "fr" | "nl" {
  return (languageCode ?? "").toLowerCase().startsWith("nl") ? "nl" : "fr";
}

interface SheetCopy {
  subject: string;
  text: string;
  html: string;
}

function buildCopy(lang: "fr" | "nl", prenom: string, reportUrl: string | null): SheetCopy {
  const safePrenom = escapeHtml(prenom);
  const safeReportUrl = reportUrl ? escapeHtml(reportUrl) : null;

  // Bouton PERMANENT « Signaler à la direction » (lien durable tout le contrat).
  const reportButtonHtml =
    safeReportUrl == null
      ? ""
      : lang === "nl"
        ? `
        <tr><td style="padding:4px 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf6;border:1px dashed #d9c98f;border-radius:10px;margin:6px 0 14px;">
            <tr><td style="padding:16px 18px;font-size:14px;line-height:1.6;color:#3a3a3a;text-align:center;">
              <p style="margin:0 0 12px;">Een opmerking, info of een probleem? Meld het rechtstreeks aan de directie.</p>
              <a href="${safeReportUrl}" style="display:inline-block;background:#c8a24a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:8px;">Melden aan de directie</a>
              <p style="margin:12px 0 0;font-size:12px;color:#8a8a8a;">Deze link vergezelt je gedurende je hele contract — bewaar hem goed.</p>
            </td></tr>
          </table>
        </td></tr>`
        : `
        <tr><td style="padding:4px 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf6;border:1px dashed #d9c98f;border-radius:10px;margin:6px 0 14px;">
            <tr><td style="padding:16px 18px;font-size:14px;line-height:1.6;color:#3a3a3a;text-align:center;">
              <p style="margin:0 0 12px;">Une remarque, une info, une anomalie ? Signale-la directement à la direction.</p>
              <a href="${safeReportUrl}" style="display:inline-block;background:#c8a24a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:8px;">Signaler à la direction</a>
              <p style="margin:12px 0 0;font-size:12px;color:#8a8a8a;">Ce lien t'accompagne pendant tout ton contrat — garde-le précieusement.</p>
            </td></tr>
          </table>
        </td></tr>`;

  const reportTextFr = safeReportUrl
    ? `\n\nUNE REMARQUE, UNE INFO, UNE ANOMALIE ?\nSignale-la directement à la direction : ${reportUrl}\nCe lien t'accompagne pendant tout ton contrat — garde-le précieusement.\n`
    : "";
  const reportTextNl = safeReportUrl
    ? `\n\nEEN OPMERKING, INFO OF EEN PROBLEEM ?\nMeld het rechtstreeks aan de directie : ${reportUrl}\nDeze link vergezelt je gedurende je hele contract — bewaar hem goed.\n`
    : "";

  // Encadré doré réutilisable (cohérent avec le mail de bienvenue existant).
  const section = (title: string, body: string) => `
        <tr><td style="padding:4px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7ef;border:1px solid #ecdfb8;border-radius:10px;margin:0 0 14px;">
            <tr><td style="padding:14px 18px;font-size:15px;line-height:1.6;color:#3a3a3a;">
              <p style="margin:0 0 6px;font-weight:700;color:#8a6d1f;">${title}</p>
              ${body}
            </td></tr>
          </table>
        </td></tr>`;

  if (lang === "nl") {
    const subject = "Jouw gids voor een vlotte start bij Caftan Factory 🌟";
    const text =
      `Hallo ${prenom},\n\n` +
      `Bedankt dat je de tijd nam om je onthaalvragenlijst in te vullen — dat betekent veel voor ons. Hier zijn je belangrijkste houvasten om je eerste werkdag met vertrouwen aan te vatten, bijna al op het niveau van je collega's.\n\n` +
      `DE BASIS\n` +
      `Stiptheid, een verzorgd voorkomen, een glimlach en respect: dat is de basis waarop iedereen bouwt. Niets ingewikkelds — gewoon reflexen die het verschil maken.\n\n` +
      `PRIORITEIT NR. 1 — DE VERKOOP\n` +
      `Dit is de kern van ons vak, en hier heb je de meeste impact. Op elk moment: alle modellen en varianten uitgestald in de rekken en netjes geordend; alles proper en opgeruimd (rekken, paskamers, kassa). Een onberispelijke winkel maakt zin om te kopen — zo eenvoudig is het.\n\n` +
      `ONZE DIENSTEN\n` +
      `Retouches EXPRESS — dezelfde dag in Brabant (behalve op vrijdag), de dag nadien in Molenbeek. Omruilen & terugbetalingen zijn STRIKT gereglementeerd: bij twijfel vraag je altijd eerst uitleg aan je verantwoordelijke vóór je handelt. Niemand verwacht dat je nu al alles weet.\n\n` +
      `HOUDING\n` +
      `Blijf kalm, ook wanneer een situatie gespannen wordt: dat is een echte sterkte. En als er een meningsverschil opduikt, regel het apart, buiten de piek- en drukke momenten.\n\n` +
      `Welkom in het team! Stel gerust al je vragen aan je verantwoordelijke — zo leer je snel en goed.\n` +
      `Het team Human Resources — Caftan Factory Group` +
      reportTextNl;

    const html = `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr><td style="padding:28px 32px 8px;">
          <h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:#1a1a1a;">Jouw gids voor een vlotte start 🌟</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 4px;font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 16px;">Hallo ${safePrenom}, bedankt dat je de tijd nam om je onthaalvragenlijst in te vullen — dat betekent veel voor ons. Hier zijn je belangrijkste houvasten om je eerste werkdag met vertrouwen aan te vatten, bijna al op het niveau van je collega's.</p>
        </td></tr>
        ${section("De basis", `<p style="margin:0;">Stiptheid, een verzorgd voorkomen, een glimlach en respect: dat is de basis waarop iedereen bouwt. Niets ingewikkelds — gewoon reflexen die het verschil maken.</p>`)}
        ${section("Prioriteit nr. 1 — DE VERKOOP", `<p style="margin:0;">Dit is de kern van ons vak, en hier heb je de meeste impact. Op elk moment: alle modellen en varianten uitgestald in de rekken en netjes geordend; alles proper en opgeruimd (rekken, paskamers, kassa). <strong>Een onberispelijke winkel maakt zin om te kopen.</strong></p>`)}
        ${section("Onze diensten", `<p style="margin:0 0 8px;"><strong>Retouches EXPRESS</strong> — dezelfde dag in Brabant (behalve op vrijdag), de dag nadien in Molenbeek.</p><p style="margin:0;">Omruilen &amp; terugbetalingen zijn <strong>STRIKT gereglementeerd</strong>: bij twijfel vraag je altijd eerst uitleg aan je verantwoordelijke vóór je handelt. Niemand verwacht dat je nu al alles weet.</p>`)}
        ${section("Houding", `<p style="margin:0;">Blijf kalm, ook wanneer een situatie gespannen wordt: dat is een echte sterkte. En als er een meningsverschil opduikt, regel het apart, buiten de piek- en drukke momenten.</p>`)}
        ${reportButtonHtml}
        <tr><td style="padding:6px 32px 28px;font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 6px;">Welkom in het team! Stel gerust al je vragen aan je verantwoordelijke — zo leer je snel en goed.</p>
          <p style="margin:0;color:#6b6b6b;">Het team Human Resources — Caftan Factory Group</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    return { subject, text, html };
  }

  // FR (défaut)
  const subject = "Ton guide pour bien démarrer chez Caftan Factory 🌟";
  const text =
    `Bonjour ${prenom},\n\n` +
    `Merci d'avoir pris le temps de remplir ton questionnaire d'accueil — ça compte vraiment pour nous. Voici tes repères clés pour aborder ta première journée en confiance, presque déjà au niveau de tes collègues.\n\n` +
    `LA BASE\n` +
    `Ponctualité, présentation soignée, sourire et respect : c'est le socle sur lequel tout le monde s'appuie. Rien de compliqué — juste des réflexes qui font toute la différence.\n\n` +
    `PRIORITÉ N°1 — LA VENTE\n` +
    `C'est le cœur de notre métier, et c'est là que tu auras le plus d'impact. À tout moment : tous les modèles et variantes présentés en rayon et bien rangés ; les espaces propres et ordonnés (rayons, cabines, caisse). Un magasin impeccable donne envie d'acheter — c'est aussi simple que ça.\n\n` +
    `NOS SERVICES\n` +
    `Retouche EXPRESS — le jour même à Brabant (sauf le vendredi), le lendemain à Molenbeek. Les échanges et remboursements sont STRICTEMENT réglementés : dans le doute, demande toujours à ton responsable de t'expliquer avant d'agir. Personne n'attend de toi que tu saches déjà tout.\n\n` +
    `ATTITUDE\n` +
    `Garde ton calme, même quand une situation se tend : c'est une vraie force. Et si un désaccord surgit, règle-le à l'écart, hors des heures de pointe et d'affluence.\n\n` +
    `Bienvenue dans l'équipe ! N'hésite jamais à poser tes questions à ton responsable — c'est comme ça qu'on apprend vite et bien.\n` +
    `L'équipe Ressources Humaines — Caftan Factory Group` +
    reportTextFr;

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr><td style="padding:28px 32px 8px;">
          <h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:#1a1a1a;">Ton guide pour bien démarrer 🌟</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 4px;font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 16px;">Bonjour ${safePrenom}, merci d'avoir pris le temps de remplir ton questionnaire d'accueil — ça compte vraiment pour nous. Voici tes repères clés pour aborder ta première journée en confiance, presque déjà au niveau de tes collègues.</p>
        </td></tr>
        ${section("La base", `<p style="margin:0;">Ponctualité, présentation soignée, sourire et respect : c'est le socle sur lequel tout le monde s'appuie. Rien de compliqué — juste des réflexes qui font toute la différence.</p>`)}
        ${section("Priorité n°1 — LA VENTE", `<p style="margin:0;">C'est le cœur de notre métier, et c'est là que tu auras le plus d'impact. À tout moment : tous les modèles et variantes présentés en rayon et bien rangés ; les espaces propres et ordonnés (rayons, cabines, caisse). <strong>Un magasin impeccable donne envie d'acheter.</strong></p>`)}
        ${section("Nos services", `<p style="margin:0 0 8px;"><strong>Retouche EXPRESS</strong> — le jour même à Brabant (sauf le vendredi), le lendemain à Molenbeek.</p><p style="margin:0;">Les échanges &amp; remboursements sont <strong>STRICTEMENT réglementés</strong> : dans le doute, demande toujours à ton responsable de t'expliquer avant d'agir. Personne n'attend de toi que tu saches déjà tout.</p>`)}
        ${section("Attitude", `<p style="margin:0;">Garde ton calme, même quand une situation se tend : c'est une vraie force. Et si un désaccord surgit, règle-le à l'écart, hors des heures de pointe et d'affluence.</p>`)}
        ${reportButtonHtml}
        <tr><td style="padding:6px 32px 28px;font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 6px;">Bienvenue dans l'équipe ! N'hésite jamais à poser tes questions à ton responsable — c'est comme ça qu'on apprend vite et bien.</p>
          <p style="margin:0;color:#6b6b6b;">L'équipe Ressources Humaines — Caftan Factory Group</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

/**
 * Envoie (une seule fois) au nouveau travailleur la fiche explicative d'onboarding.
 *
 * Best-effort : ne throw jamais. L'anti-doublon repose sur outbound_mails
 * (source `worker_onboarding_sheet`, status `sent`) par employee_id.
 *
 * @param languageCode locale (« fr »/« nl ») déduite du pre_interview ; défaut FR.
 */
export async function sendWorkerOnboardingSheet(
  admin: SupabaseClient,
  employeeId: string,
  languageCode?: string | null,
  opts?: { manual?: boolean }, // Karim 2026-07-12 : envoi MANUEL fiche (automated:false)
): Promise<{ sent: boolean; reason?: string }> {
  const manual = opts?.manual === true;
  try {
    // 1) Fiche employé : email + nom.
    const { data: empRow } = await admin
      .from("employees")
      .select("id, email, full_name")
      .eq("id", employeeId)
      .maybeSingle();
    const emp = empRow as {
      id: string;
      email: string | null;
      full_name: string | null;
    } | null;
    if (!emp) return { sent: false, reason: "employé introuvable" };
    if (!emp.email) return { sent: false, reason: "pas d'email travailleur" };

    // 2) ANTI-DOUBLON : fiche déjà envoyée pour ce travailleur ? (ignoré en manuel :
    //    l'admin peut re-déclencher volontairement depuis la fiche).
    if (!manual) {
      const { data: already } = await admin
        .from("outbound_mails")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("source", SOURCE)
        .eq("status", "sent")
        .limit(1)
        .maybeSingle();
      if (already) return { sent: false, reason: "déjà envoyé (anti-doublon)" };
    }

    // 3) Token DURABLE « Signaler à la direction » (généré si absent, n'expire pas).
    let reportUrl: string | null = null;
    try {
      const reportToken = await ensureReportToken(admin, employeeId);
      if (reportToken) reportUrl = signalerPublicUrl(reportToken);
    } catch {
      /* best-effort : le mail part même sans le bouton signalement */
    }

    // 4) Contenu FR/NL.
    const prenom = firstNameOf(emp.full_name) || "à toi";
    const copy = buildCopy(pickLang(languageCode), prenom, reportUrl);

    // 5) Envoi (best-effort) — automated + source en liste blanche du kill-switch.
    const { sendAppMail } = await import("@/lib/app-mail");
    const res = await sendAppMail({
      to: emp.email,
      toName: emp.full_name ?? undefined,
      subject: copy.subject,
      body: copy.text,
      htmlBody: copy.html,
      bccHr: true,
      automated: !manual, // MANUEL -> non taggé -> passe le kill-switch
      source: SOURCE,
      employeeId,
    });
    return { sent: res.ok, reason: res.ok ? undefined : res.error };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}
