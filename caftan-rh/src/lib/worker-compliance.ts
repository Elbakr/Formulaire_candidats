// Karim 2026-07-08 : PHASE 1 « conformité travailleur » — helpers server-only.
//
// Deux canaux :
//   - worker_document_acks   : accusés de réception (guide conduite = lu/compris/
//     assimilé/accepté). Le travailleur confirme depuis /confirmer/[token].
//   - worker_compliance_events : LE journal de manquements (INTERNE, RH only).
//     JAMAIS communiqué au travailleur en Phase 1.
//
// Le lien personnel sécurisé du travailleur = son token DURABLE
// (employees.report_token) — RÉUTILISÉ ici (même token que /signaler).

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOutboundBaseUrl } from "@/lib/public-base-url";
import { ensureReportToken } from "@/lib/worker-reports";

export const GUIDE_DOCUMENT_KEY = "guide_conduite";

/** Source outbound de l'envoi manuel « guide à confirmer » (manuel => automated:false). */
export const GUIDE_ACK_SOURCE = "document_ack_request";
/** Source de la relance automatique du questionnaire d'accueil (kill-switch). */
export const ONBOARDING_REMINDER_SOURCE = "onboarding_reminder";

/** URL publique PERMANENTE de la page d'accusé de réception (guide conduite). */
export function confirmerPublicUrl(token: string): string {
  return `${getOutboundBaseUrl()}/confirmer/${token}`;
}

function pickLang(languageCode: string | null | undefined): "fr" | "nl" {
  return (languageCode ?? "").toLowerCase().startsWith("nl") ? "nl" : "fr";
}

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

interface AckCopy {
  subject: string;
  text: string;
  html: string;
}

function buildGuideAckCopy(lang: "fr" | "nl", prenom: string, url: string): AckCopy {
  const safePrenom = escapeHtml(prenom);
  const safeUrl = escapeHtml(url);

  if (lang === "nl") {
    const subject = "Lees en bevestig de gedragsgids — Caftan Factory";
    const text =
      `Hallo ${prenom},\n\n` +
      `Gelieve onze gedragsgids (de basisregels in de winkel) te lezen en te bevestigen via de onderstaande link. ` +
      `Je vinkt aan: gelezen / begrepen / eigen gemaakt / aanvaard.\n\n` +
      `${url}\n\n` +
      `Deze link vergezelt je gedurende je hele contract — bewaar hem goed.\n` +
      `Het team Human Resources — Caftan Factory Group`;
    const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
<tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:#1a1a1a;">Lees en bevestig de gedragsgids ✅</h1></td></tr>
<tr><td style="padding:8px 32px 4px;font-size:15px;line-height:1.6;color:#3a3a3a;">
<p style="margin:0 0 12px;">Hallo ${safePrenom}, gelieve onze gedragsgids (de basisregels in de winkel) te lezen en te bevestigen. Je vinkt aan: <strong>gelezen / begrepen / eigen gemaakt / aanvaard</strong>.</p></td></tr>
<tr><td style="padding:4px 32px 8px;text-align:center;">
<a href="${safeUrl}" style="display:inline-block;background:#c8a24a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 26px;border-radius:8px;">De gids lezen en bevestigen</a>
<p style="margin:12px 0 0;font-size:12px;color:#8a8a8a;">Deze link vergezelt je gedurende je hele contract — bewaar hem goed.</p></td></tr>
<tr><td style="padding:14px 32px 28px;font-size:14px;line-height:1.6;color:#6b6b6b;"><p style="margin:0;">Het team Human Resources — Caftan Factory Group</p></td></tr>
</table></td></tr></table></body></html>`;
    return { subject, text, html };
  }

  const subject = "Lis et confirme le guide de conduite — Caftan Factory";
  const text =
    `Bonjour ${prenom},\n\n` +
    `Merci de lire notre guide de conduite (les règles de base en magasin) et de le confirmer via le lien ci-dessous. ` +
    `Tu coches : lu / compris / assimilé / accepté.\n\n` +
    `${url}\n\n` +
    `Ce lien t'accompagne pendant tout ton contrat — garde-le précieusement.\n` +
    `L'équipe Ressources Humaines — Caftan Factory Group`;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
<tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:#1a1a1a;">Lis et confirme le guide de conduite ✅</h1></td></tr>
<tr><td style="padding:8px 32px 4px;font-size:15px;line-height:1.6;color:#3a3a3a;">
<p style="margin:0 0 12px;">Bonjour ${safePrenom}, merci de lire notre guide de conduite (les règles de base en magasin) et de le confirmer. Tu coches : <strong>lu / compris / assimilé / accepté</strong>.</p></td></tr>
<tr><td style="padding:4px 32px 8px;text-align:center;">
<a href="${safeUrl}" style="display:inline-block;background:#c8a24a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 26px;border-radius:8px;">Lire et confirmer le guide</a>
<p style="margin:12px 0 0;font-size:12px;color:#8a8a8a;">Ce lien t'accompagne pendant tout ton contrat — garde-le précieusement.</p></td></tr>
<tr><td style="padding:14px 32px 28px;font-size:14px;line-height:1.6;color:#6b6b6b;"><p style="margin:0;">L'équipe Ressources Humaines — Caftan Factory Group</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/**
 * Envoi MANUEL 1-clic RH : envoie au travailleur le lien pour lire + confirmer le
 * guide de conduite. Assure le token durable, pose worker_document_acks.sent_at
 * (upsert sans écraser les confirmations existantes), envoie le mail.
 *
 * automated:false => envoi manuel, toujours autorisé par le kill-switch.
 */
export async function sendGuideAckRequest(
  admin: SupabaseClient,
  employeeId: string,
  languageCode?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { data: empRow } = await admin
    .from("employees")
    .select("id, email, full_name")
    .eq("id", employeeId)
    .maybeSingle();
  const emp = empRow as { id: string; email: string | null; full_name: string | null } | null;
  if (!emp) return { ok: false, error: "Travailleur introuvable." };
  if (!emp.email) return { ok: false, error: "Ce travailleur n'a pas d'email." };

  const token = await ensureReportToken(admin, employeeId);
  if (!token) return { ok: false, error: "Impossible de générer le lien personnel." };
  const url = confirmerPublicUrl(token);

  // Upsert sent_at SANS écraser les confirmations déjà posées.
  const { error: upErr } = await admin
    .from("worker_document_acks")
    .upsert(
      { employee_id: employeeId, document_key: GUIDE_DOCUMENT_KEY, sent_at: new Date().toISOString() },
      { onConflict: "employee_id,document_key" },
    );
  if (upErr) return { ok: false, error: upErr.message };

  const prenom = firstNameOf(emp.full_name) || "à toi";
  const copy = buildGuideAckCopy(pickLang(languageCode), prenom, url);

  const { sendAppMail } = await import("@/lib/app-mail");
  const res = await sendAppMail({
    to: emp.email,
    toName: emp.full_name ?? undefined,
    subject: copy.subject,
    body: copy.text,
    htmlBody: copy.html,
    bccHr: true,
    automated: false, // envoi MANUEL RH -> jamais bloqué
    source: GUIDE_ACK_SOURCE,
    employeeId,
  });
  return { ok: res.ok, error: res.ok ? undefined : res.error };
}

function buildReminderCopy(lang: "fr" | "nl", prenom: string, url: string): AckCopy {
  const safePrenom = escapeHtml(prenom);
  const safeUrl = escapeHtml(url);

  if (lang === "nl") {
    const subject = "Kleine herinnering — vul je onthaalvragenlijst in";
    const text =
      `Hallo ${prenom},\n\n` +
      `Je onthaalvragenlijst is nog niet ingevuld. Het duurt maar enkele minuten en helpt ons om je een vlotte start te geven.\n\n` +
      `${url}\n\n` +
      `Bedankt !\nHet team Human Resources — Caftan Factory Group`;
    const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
<tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:#1a1a1a;">Kleine herinnering ✍️</h1></td></tr>
<tr><td style="padding:8px 32px 4px;font-size:15px;line-height:1.6;color:#3a3a3a;">
<p style="margin:0 0 12px;">Hallo ${safePrenom}, je onthaalvragenlijst is nog niet ingevuld. Het duurt maar enkele minuten en helpt ons om je een vlotte start te geven.</p></td></tr>
<tr><td style="padding:4px 32px 8px;text-align:center;">
<a href="${safeUrl}" style="display:inline-block;background:#c8a24a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 26px;border-radius:8px;">De vragenlijst invullen</a></td></tr>
<tr><td style="padding:14px 32px 28px;font-size:14px;line-height:1.6;color:#6b6b6b;"><p style="margin:0;">Bedankt !<br/>Het team Human Resources — Caftan Factory Group</p></td></tr>
</table></td></tr></table></body></html>`;
    return { subject, text, html };
  }

  const subject = "Petit rappel — complète ton questionnaire d'accueil";
  const text =
    `Bonjour ${prenom},\n\n` +
    `Ton questionnaire d'accueil n'est pas encore complété. Cela ne prend que quelques minutes et nous aide à te faire démarrer sereinement.\n\n` +
    `${url}\n\n` +
    `Merci !\nL'équipe Ressources Humaines — Caftan Factory Group`;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
<tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:#1a1a1a;">Petit rappel ✍️</h1></td></tr>
<tr><td style="padding:8px 32px 4px;font-size:15px;line-height:1.6;color:#3a3a3a;">
<p style="margin:0 0 12px;">Bonjour ${safePrenom}, ton questionnaire d'accueil n'est pas encore complété. Cela ne prend que quelques minutes et nous aide à te faire démarrer sereinement.</p></td></tr>
<tr><td style="padding:4px 32px 8px;text-align:center;">
<a href="${safeUrl}" style="display:inline-block;background:#c8a24a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 26px;border-radius:8px;">Compléter le questionnaire</a></td></tr>
<tr><td style="padding:14px 32px 28px;font-size:14px;line-height:1.6;color:#6b6b6b;"><p style="margin:0;">Merci !<br/>L'équipe Ressources Humaines — Caftan Factory Group</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/**
 * Relance AUTOMATIQUE (cron) du questionnaire d'accueil non complété.
 * Source `onboarding_reminder` (whitelistée dans le kill-switch), automated:true.
 */
export async function sendOnboardingReminder(
  admin: SupabaseClient,
  input: {
    employeeId: string;
    email: string;
    fullName: string | null;
    preInterviewToken: string;
    languageCode?: string | null;
    manual?: boolean; // Karim 2026-07-12 : envoi MANUEL fiche (automated:false)
  },
): Promise<{ ok: boolean; error?: string }> {
  const { preInterviewPublicUrl } = await import("@/lib/pre-interview");
  const url = preInterviewPublicUrl(input.preInterviewToken);
  const prenom = firstNameOf(input.fullName) || "à toi";
  const copy = buildReminderCopy(pickLang(input.languageCode), prenom, url);

  const { sendAppMail } = await import("@/lib/app-mail");
  const res = await sendAppMail({
    to: input.email,
    toName: input.fullName ?? undefined,
    subject: copy.subject,
    body: copy.text,
    htmlBody: copy.html,
    bccHr: true,
    automated: input.manual !== true, // MANUEL -> non taggé -> passe le kill-switch
    source: ONBOARDING_REMINDER_SOURCE,
    employeeId: input.employeeId,
  });
  return { ok: res.ok, error: res.ok ? undefined : res.error };
}

/**
 * Insère un manquement s'il n'existe pas déjà un événement OUVERT de même kind
 * pour ce travailleur (anti-doublon). Retourne true si créé.
 */
export async function recordComplianceEventOnce(
  admin: SupabaseClient,
  input: { employeeId: string; kind: string; title: string; detail?: string; malus?: number },
): Promise<boolean> {
  const { data: existing } = await admin
    .from("worker_compliance_events")
    .select("id")
    .eq("employee_id", input.employeeId)
    .eq("kind", input.kind)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (existing) return false;

  const { error } = await admin.from("worker_compliance_events").insert({
    employee_id: input.employeeId,
    kind: input.kind,
    title: input.title,
    detail: input.detail ?? null,
    malus: input.malus ?? 1,
    status: "open",
  });
  return !error;
}
