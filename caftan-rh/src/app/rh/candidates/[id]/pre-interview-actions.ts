"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  generateToken,
  preInterviewPublicUrl,
  formatDeadlineFR,
  PRE_INTERVIEW_DURATION_DAYS,
} from "@/lib/pre-interview";
import { renderTemplate, firstNameOf, type OrgVars } from "@/lib/email-templates";
import type {
  PreInterviewDecision,
  PreInterview,
} from "@/lib/pre-interview-types";

type Result =
  | { ok: true; preInterviewId: string; token: string; publicUrl: string; expiresAt: string }
  | { ok: false; error: string };

async function fetchOrgVars(): Promise<OrgVars> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_settings")
    .select("org_name, org_email, org_phone, org_whatsapp, org_address")
    .eq("id", 1)
    .maybeSingle();
  const o = (data ?? {}) as Partial<OrgVars>;
  return {
    org_name: o.org_name ?? "Caftan Factory",
    org_email: o.org_email ?? "hr@caftanfactory.com",
    org_phone: o.org_phone ?? "+32 468 59 61 00",
    org_whatsapp: o.org_whatsapp ?? "32468596100",
    org_address: o.org_address ?? "Rue de Brabant 230, 1030 Schaerbeek",
  };
}

/**
 * Create a pre-interview instance for an application + log a draft email
 * (the RH can copy/paste the link or send it manually via EmailJS).
 *
 * The DB trigger on insert flips applications.status -> 'pre_interview_sent'
 * which in turn fires any matching email sequence registered by RH.
 */
export async function sendPreInterviewAction(input: {
  applicationId: string;
  positionRole?: string;
  language?: string;
}): Promise<Result> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const positionRole = input.positionRole?.trim() || "all";
  const language = input.language?.trim() || "fr";

  const supabase = await createClient();

  // Sanity-check: app exists, plus candidate email for the message preview
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, candidate:candidates(email, full_name)")
    .eq("id", input.applicationId)
    .single();
  if (appErr || !app) return { ok: false, error: appErr?.message ?? "Candidature introuvable" };
  const candidate = (app as unknown as { candidate: { email: string; full_name: string } | null }).candidate;
  if (!candidate?.email) return { ok: false, error: "Le candidat n'a pas d'email." };

  // Refuse to send twice while a pending one exists
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("pre_interviews")
    .select("id, status, token, expires_at")
    .eq("application_id", input.applicationId)
    .in("status", ["sent", "started"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    const e = existing as { id: string; token: string; expires_at: string };
    return {
      ok: true,
      preInterviewId: e.id,
      token: e.token,
      publicUrl: preInterviewPublicUrl(e.token),
      expiresAt: e.expires_at,
    };
  }

  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PRE_INTERVIEW_DURATION_DAYS * 24 * 3600 * 1000);

  const { data: inserted, error: insErr } = await admin
    .from("pre_interviews")
    .insert({
      application_id: input.applicationId,
      position_role: positionRole,
      token,
      language_code: language,
      sent_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: "sent",
    })
    .select("id, token, expires_at")
    .single();
  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message ?? "Échec création pré-entretien" };
  }
  const row = inserted as { id: string; token: string; expires_at: string };

  // Render the invite email and log it as an outbound draft message.
  const orgVars = await fetchOrgVars();
  const publicUrl = preInterviewPublicUrl(row.token);

  // Choix du template selon la langue. Fallback FR si NL pas dispo (avec
  // préfixe "[NL pas dispo]" pour visibilité RH).
  const isNL = language === "nl";
  const slug = isNL ? "pre_interview_invite_nl" : "pre_interview_invite";
  let { data: tmpl } = await admin
    .from("email_templates")
    .select("subject, body_html")
    .eq("slug", slug)
    .maybeSingle();
  let nlFallback = false;
  if (isNL && !tmpl) {
    const { data: frTmpl } = await admin
      .from("email_templates")
      .select("subject, body_html")
      .eq("slug", "pre_interview_invite")
      .maybeSingle();
    tmpl = frTmpl;
    nlFallback = true;
  }

  if (tmpl) {
    const t = tmpl as { subject: string; body_html: string };
    const vars = {
      ...orgVars,
      firstname: firstNameOf(candidate.full_name),
      fullname: candidate.full_name,
      custom: "",
      dates: "",
      times: "",
      link: publicUrl,
      deadline: formatDeadlineFR(row.expires_at),
    } as const;
    // renderTemplate's signature is OrgVars+CandidateVars+DynamicVars but it
    // happily renders any extra {{key}} found in the dict — so we coerce the type.
    const subjectRendered = renderTemplate(t.subject, vars as never);
    const bodyRendered = renderTemplate(t.body_html, vars as never);
    const subject = nlFallback ? `[NL pas dispo] ${subjectRendered}` : subjectRendered;
    const body = bodyRendered;
    await admin.from("messages").insert({
      application_id: input.applicationId,
      direction: "outbound",
      sender_id: profile.id,
      subject,
      body,
      email_provider_id: "pre_interview_draft",
    });
  }

  await logActivity({
    kind: "pre_interview.sent",
    targetType: "application",
    targetId: input.applicationId,
    description: `Pré-entretien envoyé (${positionRole})`,
    data: { pre_interview_id: row.id, link: publicUrl, expires_at: row.expires_at },
    actorId: profile.id,
    actorLabel: profile.full_name ?? null,
  });

  revalidatePath(`/rh/candidates/${input.applicationId}`);
  revalidatePath("/admin/pre-interview");
  revalidatePath("/rh", "layout");

  return {
    ok: true,
    preInterviewId: row.id,
    token: row.token,
    publicUrl,
    expiresAt: row.expires_at,
  };
}

/**
 * RH decision after a candidate completes the pre-interview.
 * Updates `pre_interviews.decision` (the trigger flips applications.status
 * to 'shortlistable' on shortlist; otherwise we do it explicitly here for
 * 'reject' and leave it as 'pre_interview_done' for 'reserve').
 */
export async function markPreInterviewDecisionAction(input: {
  preInterviewId: string;
  decision: PreInterviewDecision;
  note?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  if (!["shortlist", "reject", "reserve"].includes(input.decision)) {
    return { ok: false, error: "Décision invalide." };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: pi, error: e1 } = await supabase
    .from("pre_interviews")
    .select("id, application_id, status, completed_at")
    .eq("id", input.preInterviewId)
    .single();
  if (e1 || !pi) return { ok: false, error: e1?.message ?? "Pré-entretien introuvable" };
  const piRow = pi as Pick<PreInterview, "id" | "application_id" | "status" | "completed_at">;

  // Allow decisions on completed OR expired/started pre-interviews
  // (RH may want to "reject" a no-show after expiry).

  const reviewedAt = new Date();
  const { error: updErr } = await supabase
    .from("pre_interviews")
    .update({
      decision: input.decision,
      decision_note: input.note?.trim() || null,
      reviewer_id: profile.id,
      reviewed_at: reviewedAt.toISOString(),
    })
    .eq("id", input.preInterviewId);
  if (updErr) return { ok: false, error: updErr.message };

  // For 'reject' explicitly move the application to 'refused' (existing status)
  if (input.decision === "reject") {
    await admin
      .from("applications")
      .update({ status: "refused" })
      .eq("id", piRow.application_id);
  }
  // 'shortlist' is handled by the trigger -> applications.status='shortlistable'
  // 'reserve' leaves status as 'pre_interview_done' (or whatever it is).

  // RGPD : arme la purge des vidéos à decided_at + 30 jours.
  // On ne touche QUE les réponses qui ont un video_storage_path ET pour
  // lesquelles la purge n'est pas déjà armée (idempotent en cas de
  // ré-exécution accidentelle de la décision).
  const PURGE_DAYS = 30;
  const purgeAt = new Date(reviewedAt.getTime() + PURGE_DAYS * 24 * 3600 * 1000);
  const { error: purgeErr } = await admin
    .from("pre_interview_responses")
    .update({ video_purge_after: purgeAt.toISOString() })
    .eq("pre_interview_id", input.preInterviewId)
    .not("video_storage_path", "is", null);
  if (purgeErr) {
    console.warn(
      "[pre-interview] failed to arm video purge after decision:",
      purgeErr.message,
    );
  }

  await logActivity({
    kind: "pre_interview.decision",
    targetType: "application",
    targetId: piRow.application_id,
    description: `Décision pré-entretien : ${input.decision}`,
    data: {
      pre_interview_id: input.preInterviewId,
      decision: input.decision,
      note: input.note ?? null,
    },
    actorId: profile.id,
    actorLabel: profile.full_name ?? null,
  });

  revalidatePath(`/rh/candidates/${piRow.application_id}`);
  revalidatePath("/admin/pre-interview");
  revalidatePath("/rh", "layout");
  return { ok: true };
}

/**
 * RH-only: discard a still-pending pre-interview (e.g. wrong candidate).
 */
export async function discardPreInterviewAction(
  preInterviewId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data: pi } = await supabase
    .from("pre_interviews")
    .select("id, application_id")
    .eq("id", preInterviewId)
    .single();
  if (!pi) return { ok: false, error: "Pré-entretien introuvable." };

  const { error } = await supabase
    .from("pre_interviews")
    .update({ status: "discarded" })
    .eq("id", preInterviewId);
  if (error) return { ok: false, error: error.message };

  await logActivity({
    kind: "pre_interview.discarded",
    targetType: "application",
    targetId: (pi as { application_id: string }).application_id,
    description: "Pré-entretien annulé",
    data: { pre_interview_id: preInterviewId },
    actorId: profile.id,
    actorLabel: profile.full_name ?? null,
  });

  revalidatePath(`/rh/candidates/${(pi as { application_id: string }).application_id}`);
  revalidatePath("/admin/pre-interview");
  return { ok: true };
}
