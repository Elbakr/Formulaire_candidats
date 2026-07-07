// Karim 2026-07-05 : MAIL DE BIENVENUE + MINI-QUESTIONNAIRE au nouveau
// travailleur, envoyé JUSTE APRÈS la signature du contrat.
//
// Métier : on INVERSE l'ordre du « screening » (questionnaire de connaissance du
// candidat, table pre_interviews). Pour un candidat pré-validé embauché sans
// screening préalable, on l'invite à remplir ce même questionnaire APRÈS la
// signature, présenté comme un « mini-questionnaire » pour mieux le connaître.
//
// IMPORTANT : ne JAMAIS écrire le mot « screening » au travailleur.
//
// Le mail est un envoi AUTOMATIQUE assumé par Karim (comme le récap candidat) :
// source `worker_welcome_questionnaire` ajoutée à la liste blanche du kill-switch
// (outbound-guard.ts). Best-effort : ne bloque JAMAIS la signature.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateToken,
  preInterviewPublicUrl,
  PRE_INTERVIEW_DURATION_DAYS,
} from "@/lib/pre-interview";
import { ensureReportToken, signalerPublicUrl } from "@/lib/worker-reports";

const SOURCE = "worker_welcome_questionnaire";

/**
 * Genre déduit du NISS belge (numéro national) pour accorder « bienvenu(e) ».
 * Numéro d'ordre = les 3 chiffres en position 7-9 : IMPAIR = homme, PAIR = femme.
 * NISS absent / non-belge (≠ 11 chiffres) -> forme neutre « bienvenu·e ».
 */
export function welcomeWordFromNrn(nrn: string | null | undefined): string {
  const digits = (nrn ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return "bienvenu·e";
  const order = parseInt(digits.slice(6, 9), 10);
  if (!Number.isFinite(order)) return "bienvenu·e";
  return order % 2 === 1 ? "bienvenu" : "bienvenue";
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

/**
 * À la signature d'un contrat, envoie (une seule fois) au travailleur le mail de
 * bienvenue avec le lien vers son mini-questionnaire (pre_interview).
 *
 * Retour informatif seulement — l'appelant NE DOIT PAS bloquer la signature sur
 * ce résultat (déjà appelé en best-effort dans un try/catch côté signature).
 */
export async function sendWorkerWelcomeQuestionnaire(
  admin: SupabaseClient,
  employeeId: string,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    // 1) Fiche employé : email + nom + NISS + liens candidature/candidat.
    const { data: empRow } = await admin
      .from("employees")
      .select("id, email, full_name, nrn, application_id, candidate_id")
      .eq("id", employeeId)
      .maybeSingle();
    const emp = empRow as {
      id: string;
      email: string | null;
      full_name: string | null;
      nrn: string | null;
      application_id: string | null;
      candidate_id: string | null;
    } | null;
    if (!emp) return { sent: false, reason: "employé introuvable" };
    if (!emp.email) return { sent: false, reason: "pas d'email travailleur" };

    // 2) ANTI-DOUBLON : déjà envoyé pour ce travailleur ?
    const { data: already } = await admin
      .from("outbound_mails")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("source", SOURCE)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    if (already) return { sent: false, reason: "déjà envoyé (anti-doublon)" };

    // 3) Résout / crée la candidature support (pre_interviews.application_id requis).
    let applicationId = emp.application_id;
    if (!applicationId && emp.candidate_id) {
      const { data: app } = await admin
        .from("applications")
        .select("id")
        .eq("candidate_id", emp.candidate_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      applicationId = (app as { id: string } | null)?.id ?? null;
      if (!applicationId) {
        // Candidature-relais (comme hirePrevalidatedCandidateAction) pour rebrancher
        // le module pre_interviews qui exige une application_id.
        const { data: newApp } = await admin
          .from("applications")
          .insert({ candidate_id: emp.candidate_id, job_id: null, status: "new" })
          .select("id")
          .single();
        applicationId = (newApp as { id: string } | null)?.id ?? null;
      }
    }
    if (!applicationId) {
      return { sent: false, reason: "aucune candidature reliable (pas de lien candidat)" };
    }

    // 4) Réutilise un pré-entretien d'ONBOARDING en cours (sent/started) sinon en
    //    crée un. On filtre sur context='onboarding' pour NE JAMAIS réutiliser un
    //    éventuel pré-entretien de screening (sélection) de ce candidat : le
    //    travailleur embauché ne doit voir QUE le questionnaire d'accueil.
    let token: string | null = null;
    const { data: existing } = await admin
      .from("pre_interviews")
      .select("token, status")
      .eq("application_id", applicationId)
      .eq("context", "onboarding")
      .in("status", ["sent", "started"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    token = (existing as { token: string } | null)?.token ?? null;

    if (!token) {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + PRE_INTERVIEW_DURATION_DAYS * 24 * 3600 * 1000,
      );
      const newToken = generateToken();
      const { data: inserted, error: insErr } = await admin
        .from("pre_interviews")
        .insert({
          application_id: applicationId,
          position_role: "all",
          token: newToken,
          language_code: "fr",
          context: "onboarding",
          sent_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          status: "sent",
        })
        .select("token")
        .single();
      if (insErr || !inserted) {
        return { sent: false, reason: `création questionnaire KO: ${insErr?.message ?? "?"}` };
      }
      token = (inserted as { token: string }).token;
    }

    const link = preInterviewPublicUrl(token);

    // 4b) Token DURABLE « Signaler à la direction » (best-effort : le mail part même
    //     sans le bouton). Le lien n'expire pas, il accompagne tout le contrat.
    let reportUrl: string | null = null;
    try {
      const reportToken = await ensureReportToken(admin, employeeId);
      if (reportToken) reportUrl = signalerPublicUrl(reportToken);
    } catch {
      /* best-effort : on continue sans le bouton signalement */
    }

    // 5) Contenu du mail (jamais le mot « screening »).
    const prenom = firstNameOf(emp.full_name) || "à toi";
    const bienvenu = welcomeWordFromNrn(emp.nrn);
    const subject = "Bienvenue chez Caftan Factory 🎉";

    // Bloc PERMANENT « Signaler à la direction » (FR + NL), même esprit que la fiche
    // d'onboarding : lien durable pour toute la durée du contrat.
    const reportText = reportUrl
      ? `\n\n— — —\n` +
        `UNE REMARQUE, UNE INFO, UNE ANOMALIE ?\n` +
        `Signale-la directement à la direction : ${reportUrl}\n` +
        `Ce lien t'accompagne pendant tout ton contrat — garde-le précieusement.\n\n` +
        `EEN OPMERKING, INFO OF EEN PROBLEEM ?\n` +
        `Meld het rechtstreeks aan de directie : ${reportUrl}\n` +
        `Deze link vergezelt je gedurende je hele contract — bewaar hem goed.`
      : "";

    const textBody =
      `Bonjour ${prenom},\n\n` +
      `C'est officiel : ${bienvenu} dans l'équipe Caftan Factory ! Toute l'équipe est ravie de t'accueillir.\n\n` +
      `Pour bien démarrer ensemble, on aimerait apprendre à mieux te connaître. Prends 2 minutes pour compléter ce petit questionnaire : il nous aide à comprendre ton parcours, tes préférences et tes attentes — et il compte beaucoup pour nous, c'est ce qui nous permet de t'accompagner au mieux dès tes débuts.\n\n` +
      `👉 Remplir mon mini-questionnaire : ${link}\n\n` +
      `Merci d'avance, et encore bienvenue !\n` +
      `L'équipe Ressources Humaines — Caftan Factory Group` +
      reportText;

    const safePrenom = escapeHtml(prenom);
    const safeBienvenu = escapeHtml(bienvenu);
    const safeReportUrl = reportUrl ? escapeHtml(reportUrl) : null;

    // Bloc HTML PERMANENT « Signaler à la direction » (FR + NL), style cohérent avec
    // la fiche d'onboarding (encadré doré pointillé, bouton #c8a24a).
    const reportButtonHtml = safeReportUrl
      ? `
        <tr><td style="padding:4px 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf6;border:1px dashed #d9c98f;border-radius:10px;margin:6px 0 14px;">
            <tr><td style="padding:16px 18px;font-size:14px;line-height:1.6;color:#3a3a3a;text-align:center;">
              <p style="margin:0 0 12px;">Une remarque, une info, une anomalie ? Signale-la directement à la direction.<br><span style="color:#8a8a8a;">Een opmerking, info of een probleem? Meld het rechtstreeks aan de directie.</span></p>
              <a href="${safeReportUrl}" style="display:inline-block;background:#c8a24a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:8px;">Signaler à la direction / Melden aan de directie</a>
              <p style="margin:12px 0 0;font-size:12px;color:#8a8a8a;">Ce lien t'accompagne pendant tout ton contrat — garde-le précieusement.<br>Deze link vergezelt je gedurende je hele contract — bewaar hem goed.</p>
            </td></tr>
          </table>
        </td></tr>`
      : "";
    const htmlBody = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2b2b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr><td style="padding:28px 32px 8px;">
          <h1 style="margin:0 0 4px;font-size:22px;line-height:1.3;color:#1a1a1a;">Bienvenue chez Caftan Factory 🎉</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 16px;">Bonjour ${safePrenom},</p>
          <p style="margin:0 0 16px;">C'est officiel : <strong>${safeBienvenu}</strong> dans l'équipe Caftan Factory ! Toute l'équipe est ravie de t'accueillir.</p>
          <p style="margin:0 0 16px;">Pour bien démarrer ensemble, on aimerait apprendre à mieux te connaître. Prends 2 minutes pour compléter ce petit questionnaire : il nous aide à comprendre ton parcours, tes préférences et tes attentes — et il compte beaucoup pour nous, c'est ce qui nous permet de t'accompagner au mieux dès tes débuts.</p>
        </td></tr>
        <tr><td align="center" style="padding:8px 32px 24px;">
          <a href="${link}" style="display:inline-block;background:#c9a227;color:#1a1a1a;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;">Remplir mon mini-questionnaire</a>
        </td></tr>
        ${reportButtonHtml}
        <tr><td style="padding:0 32px 28px;font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 6px;">Merci d'avance, et encore bienvenue !</p>
          <p style="margin:0;color:#6b6b6b;">L'équipe Ressources Humaines — Caftan Factory Group</p>
        </td></tr>
      </table>
      <p style="max-width:560px;margin:14px auto 0;font-size:12px;color:#9a9a9a;text-align:center;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur : ${link}</p>
    </td></tr>
  </table>
</body></html>`;

    // 6) Envoi (best-effort) — automated + source en liste blanche du kill-switch.
    const { sendAppMail } = await import("@/lib/app-mail");
    const res = await sendAppMail({
      to: emp.email,
      toName: emp.full_name ?? undefined,
      subject,
      body: textBody,
      htmlBody,
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
