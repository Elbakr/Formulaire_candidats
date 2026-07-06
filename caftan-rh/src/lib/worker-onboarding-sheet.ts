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

function buildCopy(lang: "fr" | "nl", prenom: string): SheetCopy {
  const safePrenom = escapeHtml(prenom);

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
      `Bedankt om je onthaalvragenlijst in te vullen! Hier is het essentiële om je eerste werkdag te starten, bijna op het niveau van je collega's.\n\n` +
      `DE BASIS (vanzelfsprekend)\n` +
      `Stiptheid, een verzorgd voorkomen, een glimlach en respect — dat is de basis, verworven voor iedereen.\n\n` +
      `PRIORITEIT NR. 1 — DE VERKOOP\n` +
      `Dit is de kern van ons vak. Op elk moment: alle modellen en varianten uitgestald in de rekken en netjes geordend; alles proper en opgeruimd (rekken, paskamers, kassa). Een onberispelijke winkel = meer verkoop.\n\n` +
      `ONZE DIENSTEN\n` +
      `Retouches EXPRESS — dezelfde dag in Brabant (behalve op vrijdag), de dag nadien in Molenbeek. Omruilen & terugbetaling zijn STRIKT gereglementeerd → vraag altijd eerst uitleg aan je verantwoordelijke vóór je handelt.\n\n` +
      `HOUDING\n` +
      `Blijf kalm, ook in moeilijke situaties. Regel een meningsverschil apart, buiten de piek- en drukke momenten.\n\n` +
      `Welkom in het team — stel al je vragen aan je verantwoordelijke.\n` +
      `Het team Human Resources — Caftan Factory Group`;

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
          <p style="margin:0 0 16px;">Hallo ${safePrenom}, bedankt om je onthaalvragenlijst in te vullen! Hier is het essentiële om je eerste werkdag te starten, bijna op het niveau van je collega's.</p>
        </td></tr>
        ${section("De basis (vanzelfsprekend)", `<p style="margin:0;">Stiptheid, een verzorgd voorkomen, een glimlach en respect — dat is de basis, verworven voor iedereen.</p>`)}
        ${section("Prioriteit nr. 1 — DE VERKOOP", `<p style="margin:0;">Dit is de kern van ons vak. Op elk moment: alle modellen en varianten uitgestald in de rekken en netjes geordend; alles proper en opgeruimd (rekken, paskamers, kassa). <strong>Een onberispelijke winkel = meer verkoop.</strong></p>`)}
        ${section("Onze diensten", `<p style="margin:0 0 8px;"><strong>Retouches EXPRESS</strong> — dezelfde dag in Brabant (behalve op vrijdag), de dag nadien in Molenbeek.</p><p style="margin:0;">Omruilen &amp; terugbetaling zijn <strong>STRIKT gereglementeerd</strong> → vraag altijd eerst uitleg aan je verantwoordelijke vóór je handelt.</p>`)}
        ${section("Houding", `<p style="margin:0;">Blijf kalm, ook in moeilijke situaties. Regel een meningsverschil apart, buiten de piek- en drukke momenten.</p>`)}
        <tr><td style="padding:6px 32px 28px;font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 6px;">Welkom in het team — stel al je vragen aan je verantwoordelijke.</p>
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
    `Merci d'avoir rempli ton questionnaire d'accueil ! Voici l'essentiel pour démarrer ta première journée presque au niveau de tes collègues.\n\n` +
    `LA BASE (évidente)\n` +
    `Ponctualité, présentation soignée, sourire, respect — c'est le socle, acquis pour tout le monde.\n\n` +
    `PRIORITÉ N°1 — LA VENTE\n` +
    `C'est le cœur de notre métier. À tout moment : tous les modèles et variantes présentés en rayon et bien rangés ; les lieux propres et ordonnés (rayons, cabines, caisse). Un magasin impeccable = plus de ventes.\n\n` +
    `NOS SERVICES\n` +
    `Retouche EXPRESS — le jour même à Brabant (sauf le vendredi), le lendemain à Molenbeek. Échange & remboursement sont STRICTEMENT réglementés → demande toujours au responsable de t'expliquer avant d'agir.\n\n` +
    `ATTITUDE\n` +
    `Garde ton calme même dans les situations compliquées. Règle un désaccord à l'écart, hors des heures de pointe et d'affluence.\n\n` +
    `Bienvenue dans l'équipe — pose toutes tes questions à ton responsable.\n` +
    `L'équipe Ressources Humaines — Caftan Factory Group`;

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
          <p style="margin:0 0 16px;">Bonjour ${safePrenom}, merci d'avoir rempli ton questionnaire d'accueil ! Voici l'essentiel pour démarrer ta première journée presque au niveau de tes collègues.</p>
        </td></tr>
        ${section("La base (évidente)", `<p style="margin:0;">Ponctualité, présentation soignée, sourire, respect — c'est le socle, acquis pour tout le monde.</p>`)}
        ${section("Priorité n°1 — LA VENTE", `<p style="margin:0;">C'est le cœur de notre métier. À tout moment : tous les modèles et variantes présentés en rayon et bien rangés ; les lieux propres et ordonnés (rayons, cabines, caisse). <strong>Un magasin impeccable = plus de ventes.</strong></p>`)}
        ${section("Nos services", `<p style="margin:0 0 8px;"><strong>Retouche EXPRESS</strong> — le jour même à Brabant (sauf le vendredi), le lendemain à Molenbeek.</p><p style="margin:0;">Échange &amp; remboursement sont <strong>STRICTEMENT réglementés</strong> → demande toujours au responsable de t'expliquer avant d'agir.</p>`)}
        ${section("Attitude", `<p style="margin:0;">Garde ton calme même dans les situations compliquées. Règle un désaccord à l'écart, hors des heures de pointe et d'affluence.</p>`)}
        <tr><td style="padding:6px 32px 28px;font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 6px;">Bienvenue dans l'équipe — pose toutes tes questions à ton responsable.</p>
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
): Promise<{ sent: boolean; reason?: string }> {
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

    // 2) ANTI-DOUBLON : fiche déjà envoyée pour ce travailleur ?
    const { data: already } = await admin
      .from("outbound_mails")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("source", SOURCE)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    if (already) return { sent: false, reason: "déjà envoyé (anti-doublon)" };

    // 3) Contenu FR/NL.
    const prenom = firstNameOf(emp.full_name) || "à toi";
    const copy = buildCopy(pickLang(languageCode), prenom);

    // 4) Envoi (best-effort) — automated + source en liste blanche du kill-switch.
    const { sendAppMail } = await import("@/lib/app-mail");
    const res = await sendAppMail({
      to: emp.email,
      toName: emp.full_name ?? undefined,
      subject: copy.subject,
      body: copy.text,
      htmlBody: copy.html,
      bccHr: true,
      automated: true,
      source: SOURCE,
      employeeId,
    });
    return { sent: res.ok, reason: res.ok ? undefined : res.error };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}
