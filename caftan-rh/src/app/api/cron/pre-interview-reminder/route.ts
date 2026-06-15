// GET /api/cron/pre-interview-reminder
//
// Relance automatique des pré-entretiens envoyés mais non complétés :
//  - lien qui expire dans moins de 2 jours (J-2) OU déjà expiré
//  - un seul renvoi max toutes les 3 jours par candidature (anti-spam)
//  - régénère le token + prolonge expires_at de PRE_INTERVIEW_DURATION_DAYS jours
//  - log un message brouillon "relance" dans messages (historique candidat)
//  - notifie les profils admin/rh avec nom candidat + nouvelle échéance + lien fiche
//
// Cadence recommandée : quotidienne à 08h00 Europe/Brussels.
// Auth : Bearer CRON_SECRET (Vercel Cron Scheduler).

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToProfiles } from "@/lib/push-notify";
import {
  generateToken,
  preInterviewPublicUrl,
  formatDeadlineFR,
  PRE_INTERVIEW_DURATION_DAYS,
} from "@/lib/pre-interview";
import { renderTemplate, firstNameOf, type OrgVars } from "@/lib/email-templates";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

/** Délai anti-spam : on ne relance pas une même candidature plus d'une fois par X jours. */
const ANTI_SPAM_DAYS = 3;

/** On relance si expires_at est dans moins de N jours (ou déjà passé). */
const REMIND_BEFORE_EXPIRY_DAYS = 2;

type PiRow = {
  id: string;
  application_id: string;
  position_role: string;
  token: string;
  language_code: string;
  expires_at: string | null;
  status: string;
};

type AppRow = {
  id: string;
  candidate: {
    email: string | null;
    full_name: string;
    profile_id: string | null;
  } | null;
};

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const remindThreshold = new Date(
    now.getTime() + REMIND_BEFORE_EXPIRY_DAYS * 24 * 3600 * 1000,
  );
  const antiSpamCutoff = new Date(
    now.getTime() - ANTI_SPAM_DAYS * 24 * 3600 * 1000,
  );

  // ─── 1. Charger org_settings ───────────────────────────────────────────────
  const { data: orgRow } = await admin
    .from("org_settings")
    .select("org_name, org_email, org_phone, org_whatsapp, org_address")
    .eq("id", 1)
    .maybeSingle();
  const o = (orgRow ?? {}) as Partial<OrgVars>;
  const orgVars: OrgVars = {
    org_name: o.org_name ?? "Caftan Factory",
    org_email: o.org_email ?? "hr@caftanfactory.com",
    org_phone: o.org_phone ?? "+32 468 59 61 00",
    org_whatsapp: o.org_whatsapp ?? "32468596100",
    org_address: o.org_address ?? "Rue de Brabant 230, 1030 Schaerbeek",
  };

  // ─── 2. Pré-entretiens candidats (sent ou started, non complétés) ──────────
  //    expires_at <= seuil J+2 (ou null = pas d'expiration connue → on ignore)
  const { data: piRows, error: piErr } = await admin
    .from("pre_interviews")
    .select(
      "id, application_id, position_role, token, language_code, expires_at, status",
    )
    .in("status", ["sent", "started"])
    .not("expires_at", "is", null)
    .lte("expires_at", remindThreshold.toISOString())
    .order("expires_at", { ascending: true })
    .limit(100);

  if (piErr) {
    return NextResponse.json({ error: piErr.message }, { status: 500 });
  }

  const pis = (piRows ?? []) as PiRow[];

  if (pis.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0, skipped_antispam: 0 });
  }

  // ─── 3. Anti-spam : récupérer les application_ids avec une relance récente ─
  const applicationIds = pis.map((p) => p.application_id);

  const { data: recentMessages } = await admin
    .from("messages")
    .select("application_id")
    .in("application_id", applicationIds)
    .eq("email_provider_id", "pre_interview_relance")
    .gte("created_at", antiSpamCutoff.toISOString());

  const recentlySentSet = new Set(
    ((recentMessages ?? []) as Array<{ application_id: string }>).map(
      (m) => m.application_id,
    ),
  );

  // ─── 4. Charger les candidatures + candidats ────────────────────────────────
  const { data: appRows } = await admin
    .from("applications")
    .select("id, candidate:candidates(email, full_name, profile_id)")
    .in("id", applicationIds);

  const appsById = new Map<string, AppRow>();
  for (const a of (appRows ?? []) as unknown as AppRow[]) {
    appsById.set(a.id, a);
  }

  // ─── 5. Charger les profils admin/rh pour les notifications ────────────────
  const { data: rhRows } = await admin
    .from("profiles")
    .select("id")
    .in("role", ["admin", "rh"]);
  const rhIds = ((rhRows ?? []) as Array<{ id: string }>).map((p) => p.id);

  // ─── 6. Charger le template de relance ─────────────────────────────────────
  const { data: tmplRow } = await admin
    .from("email_templates")
    .select("subject, body_html")
    .eq("slug", "pre_interview_relance")
    .maybeSingle();
  const tmpl = tmplRow as { subject: string; body_html: string } | null;

  // ─── 7. Traiter chaque pré-entretien ───────────────────────────────────────
  let reminded = 0;
  let skippedAntispam = 0;
  const errors: Array<{ pi_id: string; reason: string }> = [];
  const notifInserts: Array<{
    recipient_id: string;
    kind: string;
    title: string;
    body: string;
    link: string;
    data: Record<string, unknown>;
  }> = [];

  for (const pi of pis) {
    // Anti-spam
    if (recentlySentSet.has(pi.application_id)) {
      skippedAntispam++;
      continue;
    }

    const app = appsById.get(pi.application_id);
    if (!app?.candidate?.email) {
      errors.push({ pi_id: pi.id, reason: "candidat sans email" });
      continue;
    }
    const candidate = app.candidate;

    // Régénérer token + prolonger expires_at
    const newToken = generateToken();
    const newExpiresAt = new Date(
      now.getTime() + PRE_INTERVIEW_DURATION_DAYS * 24 * 3600 * 1000,
    );

    const { error: updErr } = await admin
      .from("pre_interviews")
      .update({
        token: newToken,
        expires_at: newExpiresAt.toISOString(),
        // Remettre "sent" si le lien avait expiré (status reste started si déjà commencé)
        status: pi.status === "sent" ? "sent" : pi.status,
      })
      .eq("id", pi.id);

    if (updErr) {
      errors.push({ pi_id: pi.id, reason: updErr.message });
      continue;
    }

    const publicUrl = preInterviewPublicUrl(newToken);
    const deadlineFR = formatDeadlineFR(newExpiresAt.toISOString());
    const firstname = firstNameOf(candidate.full_name);

    // Rendre le template (ou fallback texte brut)
    let subject = `Rappel — votre pré-entretien Caftan Factory`;
    let body = `Bonjour ${firstname},\n\nVotre lien de pré-entretien a été renouvelé. Cliquez ici pour répondre :\n${publicUrl}\n\nLien valable jusqu'au ${deadlineFR}.\n\nL'équipe RH — ${orgVars.org_name}`;

    if (tmpl) {
      const vars = {
        ...orgVars,
        firstname,
        fullname: candidate.full_name,
        custom: "",
        dates: "",
        times: "",
        link: publicUrl,
        deadline: deadlineFR,
      } as const;
      subject = renderTemplate(tmpl.subject, vars as never);
      body = renderTemplate(tmpl.body_html, vars as never);
    }

    // Log message brouillon (historique candidat + déclencheur anti-spam)
    const { error: msgErr } = await admin.from("messages").insert({
      application_id: pi.application_id,
      direction: "outbound",
      sender_id: null,
      subject,
      body: body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000),
      email_provider_id: "pre_interview_relance",
    });

    if (msgErr) {
      errors.push({ pi_id: pi.id, reason: `message: ${msgErr.message}` });
      // On continue quand même — le token a déjà été renouvelé
    }

    // Log activité
    await logActivity({
      kind: "pre_interview.sent",
      targetType: "application",
      targetId: pi.application_id,
      description: `Relance automatique pré-entretien (token renouvelé, échéance ${deadlineFR})`,
      data: {
        pre_interview_id: pi.id,
        new_token: newToken,
        expires_at: newExpiresAt.toISOString(),
        link: publicUrl,
      },
      actorId: null,
      actorLabel: "cron/pre-interview-reminder",
    });

    // Préparer les notifications RH
    const isExpired = pi.expires_at && new Date(pi.expires_at) < now;
    const echeanceLabel = isExpired
      ? `expiré — renouvelé jusqu'au ${deadlineFR}`
      : `expire le ${deadlineFR}`;
    const rhLink = `/rh/candidates/${pi.application_id}`;

    for (const rhId of rhIds) {
      notifInserts.push({
        recipient_id: rhId,
        kind: "pre_interview_reminder",
        title: `Relance pré-entretien — ${candidate.full_name}`,
        body: `Lien ${echeanceLabel}. Token renouvelé automatiquement.`,
        link: rhLink,
        data: {
          application_id: pi.application_id,
          pre_interview_id: pi.id,
          expires_at: newExpiresAt.toISOString(),
        },
      });
    }

    reminded++;
  }

  // ─── 8. Insérer les notifications RH en batch ───────────────────────────────
  if (notifInserts.length > 0) {
    const { error: notifErr } = await admin
      .from("notifications")
      .insert(notifInserts);
    if (notifErr) {
      errors.push({ pi_id: "batch_notif", reason: notifErr.message });
    }
  }

  // ─── 9. Push (best effort) ─────────────────────────────────────────────────
  let push = { sent: 0, failed: 0 };
  if (rhIds.length > 0 && reminded > 0) {
    try {
      push = await sendPushToProfiles(rhIds, {
        title: "Relance pré-entretien",
        body: `${reminded} candidat(s) relancé(s) automatiquement.`,
        link: "/rh",
        priority: "normal",
        tag: `pre-interview-reminder-${now.toISOString().slice(0, 10)}`,
      });
    } catch {
      /* push non bloquant */
    }
  }

  return NextResponse.json({
    ok: true,
    reminded,
    skipped_antispam: skippedAntispam,
    errors,
    push_sent: push.sent,
    push_failed: push.failed,
  });
}
