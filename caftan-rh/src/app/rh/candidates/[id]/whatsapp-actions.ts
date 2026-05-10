"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import {
  getTwilioClient,
  normalizePhoneE164,
  toWhatsAppAddress,
} from "@/lib/whatsapp/client";
import {
  checkSendEligibility,
  getCandidateIdForApplication,
  getTemplateBySlug,
  substituteTemplateVariables,
} from "@/lib/whatsapp/compliance";
import { logActivity } from "@/lib/activity";

type SendArgs = {
  applicationId: string;
  body: string;
  mediaUrl?: string | null;
};

export type WhatsAppSendResult = {
  ok?: boolean;
  sid?: string;
  error?: string;
  recipient?: string;
  reason?: string;
};

export type WhatsAppPreviewResult = {
  ok?: boolean;
  recipient?: string;
  error?: string;
  candidateName?: string;
  in24hWindow?: boolean;
  hasOptIn?: boolean;
  isBlocked?: boolean;
};

async function resolveRecipientPhone(
  applicationId: string,
): Promise<{
  phone: string | null;
  rawPhone: string | null;
  name: string | null;
  candidateId: string | null;
  error?: string;
}> {
  const supabase = await createClient();
  const { data: app } = await supabase
    .from("applications")
    .select("id, candidate:candidates(id, full_name, phone)")
    .eq("id", applicationId)
    .single();
  if (!app) {
    return {
      phone: null,
      rawPhone: null,
      name: null,
      candidateId: null,
      error: "Candidature introuvable.",
    };
  }

  const candidate = (
    app as unknown as {
      candidate: { id: string; full_name: string; phone: string | null } | null;
    }
  ).candidate;
  if (!candidate) {
    return {
      phone: null,
      rawPhone: null,
      name: null,
      candidateId: null,
      error: "Candidat introuvable.",
    };
  }
  const rawPhone = candidate.phone ?? null;
  if (!rawPhone) {
    return {
      phone: null,
      rawPhone: null,
      name: candidate.full_name,
      candidateId: candidate.id,
      error: "Numéro de téléphone manquant.",
    };
  }
  const phone = normalizePhoneE164(rawPhone);
  if (!phone) {
    return {
      phone: null,
      rawPhone,
      name: candidate.full_name,
      candidateId: candidate.id,
      error: "Numéro de téléphone invalide (impossible à normaliser).",
    };
  }
  return { phone, rawPhone, name: candidate.full_name, candidateId: candidate.id };
}

/**
 * Resolve recipient phone for an application — used by the dialog before showing the
 * confirmation step. Does NOT send anything. Returns compliance state so the UI can
 * decide between freeform and template-only paths.
 */
export async function prepareWhatsAppPreviewAction(args: {
  applicationId: string;
  body?: string;
}): Promise<WhatsAppPreviewResult> {
  await requireRole(["admin", "rh", "manager"]);
  if (!args.applicationId) return { error: "Application requise." };
  const r = await resolveRecipientPhone(args.applicationId);
  if (r.error || !r.phone || !r.candidateId) {
    return { error: r.error ?? "Numéro indisponible." };
  }
  const eligibility = await checkSendEligibility({ candidateId: r.candidateId });
  return {
    ok: true,
    recipient: r.phone,
    candidateName: r.name ?? undefined,
    in24hWindow: eligibility.in24hWindow,
    hasOptIn: eligibility.hasOptIn,
    isBlocked: eligibility.isBlocked,
  };
}

export async function sendWhatsAppAction(args: SendArgs): Promise<WhatsAppSendResult> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);

  if (!args.applicationId) return { error: "Application requise." };
  const body = (args.body ?? "").trim();
  if (!body) return { error: "Message vide." };
  if (body.length > 1500) return { error: "Message trop long (max 1500 caractères)." };

  const recipient = await resolveRecipientPhone(args.applicationId);
  if (recipient.error || !recipient.phone || !recipient.candidateId) {
    return { error: recipient.error ?? "Numéro indisponible." };
  }

  // Compliance gate — freeform send (NOT a template).
  const eligibility = await checkSendEligibility({
    candidateId: recipient.candidateId,
    isTemplate: false,
  });
  if (!eligibility.ok) {
    await logActivity({
      kind: "whatsapp.blocked",
      targetType: "application",
      targetId: args.applicationId,
      description: `Envoi WhatsApp bloqué (${eligibility.reason ?? "unknown"})`,
      actorId: profile.id,
      actorLabel: profile.full_name ?? profile.email ?? null,
      data: { reason: eligibility.reason, candidate_id: recipient.candidateId },
    });
    return { error: eligibility.hint ?? "Envoi non autorisé.", reason: eligibility.reason };
  }

  const bundle = await getTwilioClient();
  if (!bundle) {
    return {
      error:
        "WhatsApp non configuré ou désactivé. Configure-le dans /admin/integrations/whatsapp.",
    };
  }

  const fromAddress = bundle.fromNumber.startsWith("whatsapp:")
    ? bundle.fromNumber
    : `whatsapp:${bundle.fromNumber}`;
  const toAddress = toWhatsAppAddress(recipient.phone);

  let sid: string | undefined;
  try {
    const created = await bundle.client.messages.create({
      from: fromAddress,
      to: toAddress,
      body,
      ...(args.mediaUrl ? { mediaUrl: [args.mediaUrl] } : {}),
    });
    sid = created.sid;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur Twilio inconnue";
    console.error("[whatsapp] send failed:", msg);
    return { error: `Échec de l'envoi : ${msg}` };
  }

  // Log into messages table (admin client to bypass RLS for system fields)
  const admin = createAdminClient();
  await admin.from("messages").insert({
    application_id: args.applicationId,
    direction: "outbound",
    sender_id: profile.id,
    subject: null,
    body: body.slice(0, 5000),
    email_provider_id: "whatsapp.twilio",
    whatsapp_sid: sid ?? null,
    wa_to_phone: recipient.phone,
  });

  await admin
    .from("whatsapp_settings")
    .update({ last_send_at: new Date().toISOString() })
    .eq("id", 1);

  await logActivity({
    kind: "whatsapp.sent",
    targetType: "application",
    targetId: args.applicationId,
    description: `WhatsApp envoyé à ${recipient.name ?? recipient.phone}`.slice(0, 200),
    actorId: profile.id,
    actorLabel: profile.full_name ?? profile.email ?? null,
    data: {
      provider: "whatsapp.twilio",
      to_phone: recipient.phone,
      sid: sid ?? null,
      mode: "freeform",
    },
  });

  revalidatePath(`/rh/candidates/${args.applicationId}`);
  revalidatePath("/rh/messages");
  return { ok: true, sid, recipient: recipient.phone };
}

/**
 * Test send used by the settings page — sends to an arbitrary phone, no
 * application_id, no messages row. Returns the Twilio sid on success.
 */
export async function sendWhatsAppTestAction(args: {
  toPhone: string;
  body: string;
}): Promise<WhatsAppSendResult> {
  await requireRole(["admin"]);
  const body = (args.body ?? "").trim();
  if (!body) return { error: "Message vide." };
  const phone = normalizePhoneE164(args.toPhone);
  if (!phone) return { error: "Numéro de destination invalide." };

  const bundle = await getTwilioClient();
  if (!bundle) {
    return {
      error:
        "WhatsApp non configuré ou désactivé. Active-le et renseigne les identifiants Twilio.",
    };
  }
  const fromAddress = bundle.fromNumber.startsWith("whatsapp:")
    ? bundle.fromNumber
    : `whatsapp:${bundle.fromNumber}`;

  try {
    const created = await bundle.client.messages.create({
      from: fromAddress,
      to: toWhatsAppAddress(phone),
      body,
    });
    const admin = createAdminClient();
    await admin
      .from("whatsapp_settings")
      .update({ last_send_at: new Date().toISOString() })
      .eq("id", 1);
    return { ok: true, sid: created.sid, recipient: phone };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur Twilio inconnue";
    return { error: `Échec : ${msg}` };
  }
}

/**
 * Compliant template send (HSM). Required for any first-contact / out-of-window
 * conversation. The template MUST be approved by Meta (status='approved') and
 * its body MUST match what was approved exactly.
 */
export async function sendWhatsAppTemplateAction(args: {
  applicationId: string;
  templateSlug: string;
  variables: string[];
}): Promise<WhatsAppSendResult> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);

  if (!args.applicationId) return { error: "Application requise." };
  if (!args.templateSlug) return { error: "Template requis." };

  const template = await getTemplateBySlug(args.templateSlug);
  if (!template) return { error: "Template introuvable." };
  if (template.status !== "approved" || !template.is_active) {
    return {
      error:
        "Template non approuvé / inactif. Faites approuver le template par Meta avant de l'utiliser.",
    };
  }
  if ((template.variables_count ?? 0) !== args.variables.length) {
    return {
      error: `Le template attend ${template.variables_count} variable(s), ${args.variables.length} fournie(s).`,
    };
  }

  const recipient = await resolveRecipientPhone(args.applicationId);
  if (recipient.error || !recipient.phone || !recipient.candidateId) {
    return { error: recipient.error ?? "Numéro indisponible." };
  }

  const eligibility = await checkSendEligibility({
    candidateId: recipient.candidateId,
    isTemplate: true,
    templateSlug: args.templateSlug,
  });
  if (!eligibility.ok) {
    await logActivity({
      kind: "whatsapp.blocked",
      targetType: "application",
      targetId: args.applicationId,
      description: `Envoi WhatsApp template bloqué (${eligibility.reason ?? "unknown"})`,
      actorId: profile.id,
      actorLabel: profile.full_name ?? profile.email ?? null,
      data: {
        reason: eligibility.reason,
        candidate_id: recipient.candidateId,
        template: args.templateSlug,
      },
    });
    return { error: eligibility.hint ?? "Envoi non autorisé.", reason: eligibility.reason };
  }

  const bundle = await getTwilioClient();
  if (!bundle) {
    return {
      error:
        "WhatsApp non configuré ou désactivé. Configure-le dans /admin/integrations/whatsapp.",
    };
  }

  const fromAddress = bundle.fromNumber.startsWith("whatsapp:")
    ? bundle.fromNumber
    : `whatsapp:${bundle.fromNumber}`;
  const toAddress = toWhatsAppAddress(recipient.phone);

  // Substitute body for our `messages` row (audit trail).
  const renderedBody = substituteTemplateVariables(template.body, args.variables);

  // Twilio Content API expects { 1: "value", 2: "value" } as a JSON string.
  const contentVariables: Record<string, string> = {};
  args.variables.forEach((v, i) => {
    contentVariables[String(i + 1)] = v;
  });

  let sid: string | undefined;
  try {
    if (template.twilio_content_sid) {
      const created = await bundle.client.messages.create({
        from: fromAddress,
        to: toAddress,
        contentSid: template.twilio_content_sid,
        contentVariables: JSON.stringify(contentVariables),
      });
      sid = created.sid;
    } else {
      // Fallback path — no Content SID yet (template still pending). We send
      // the rendered body. Note : Meta WILL flag this if outside 24h window
      // because there's no proper HSM session. Prefer to wait for SID.
      const created = await bundle.client.messages.create({
        from: fromAddress,
        to: toAddress,
        body: renderedBody,
      });
      sid = created.sid;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur Twilio inconnue";
    console.error("[whatsapp] template send failed:", msg);
    return { error: `Échec de l'envoi : ${msg}` };
  }

  const admin = createAdminClient();
  await admin.from("messages").insert({
    application_id: args.applicationId,
    direction: "outbound",
    sender_id: profile.id,
    subject: `Template: ${template.slug}`,
    body: renderedBody.slice(0, 5000),
    email_provider_id: "whatsapp.twilio",
    whatsapp_sid: sid ?? null,
    wa_to_phone: recipient.phone,
  });

  await admin
    .from("whatsapp_settings")
    .update({ last_send_at: new Date().toISOString() })
    .eq("id", 1);

  await logActivity({
    kind: "whatsapp.sent",
    targetType: "application",
    targetId: args.applicationId,
    description: `WhatsApp template "${template.slug}" envoyé à ${
      recipient.name ?? recipient.phone
    }`.slice(0, 200),
    actorId: profile.id,
    actorLabel: profile.full_name ?? profile.email ?? null,
    data: {
      provider: "whatsapp.twilio",
      to_phone: recipient.phone,
      sid: sid ?? null,
      mode: "template",
      template_slug: template.slug,
      content_sid: template.twilio_content_sid,
    },
  });

  revalidatePath(`/rh/candidates/${args.applicationId}`);
  revalidatePath("/rh/messages");
  return { ok: true, sid, recipient: recipient.phone };
}
