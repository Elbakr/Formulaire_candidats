"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { renderTemplate, firstNameOf, type OrgVars } from "@/lib/email-templates";
import { logActivity } from "@/lib/activity";
import { subjectRoot } from "@/lib/inbound/parse";

type PrepareArgs = {
  applicationIds: string[];
  templateSlug: string;
  customMessage?: string | null;
  dates?: string | null;
  times?: string | null;
  customSubject?: string | null;
  /** Override per-application — utile pour mode séquentiel (chaque candidat = créneau différent) */
  perRecipient?: Record<string, { dates?: string | null; times?: string | null }>;
};

export type PreparedEmail = {
  application_id: string;
  to_email: string;
  to_name: string;
  subject: string;
  body: string;
};

type PrepareResult = {
  ok?: boolean;
  error?: string;
  emails?: PreparedEmail[];
  invalidCount?: number;
};

/** Make sure the subject contains a [#APP-<short>] tag so replies can be matched. */
function tagSubjectWithApp(subject: string, applicationId: string): string {
  if (/\[#APP-[0-9a-fA-F-]+\]/.test(subject)) return subject;
  const short = applicationId.replace(/-/g, "").slice(0, 8);
  return `[#APP-${short}] ${subject}`.trim();
}

/**
 * Prepare les emails à envoyer (rendering serveur + récupération destinataires).
 * Le client envoie ensuite via EmailJS et appelle logEmailSentAction pour chaque succès.
 */
export async function prepareEmailBatchAction(args: PrepareArgs): Promise<PrepareResult> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  if (!args.applicationIds || args.applicationIds.length === 0) {
    return { error: "Aucun candidat sélectionné." };
  }
  if (!args.templateSlug) return { error: "Template requis." };

  const [{ data: tmpl }, { data: org }, { data: apps }] = await Promise.all([
    supabase.from("email_templates").select("*").eq("slug", args.templateSlug).single(),
    supabase.from("org_settings").select("org_name, org_email, org_phone, org_whatsapp, org_address").eq("id", 1).single(),
    supabase
      .from("applications")
      .select("id, candidate:candidates(email, full_name)")
      .in("id", args.applicationIds),
  ]);

  if (!tmpl) return { error: "Template introuvable." };
  const template = tmpl as unknown as { slug: string; subject: string; body_html: string };
  const orgVars: OrgVars = {
    org_name: (org as { org_name?: string } | null)?.org_name ?? "Caftan Factory",
    org_email: (org as { org_email?: string } | null)?.org_email ?? "hr@caftanfactory.com",
    org_phone: (org as { org_phone?: string } | null)?.org_phone ?? "+32 468 59 61 00",
    org_whatsapp: (org as { org_whatsapp?: string } | null)?.org_whatsapp ?? "32468596100",
    org_address: (org as { org_address?: string } | null)?.org_address ?? "Rue de Brabant 230, 1030 Schaerbeek",
  };

  const emails: PreparedEmail[] = [];
  let invalid = 0;

  type AppRow = { id: string; candidate: { email: string; full_name: string } | null };
  for (const app of (apps ?? []) as unknown as AppRow[]) {
    if (!app.candidate?.email) {
      invalid += 1;
      continue;
    }
    const candidateVars = {
      firstname: firstNameOf(app.candidate.full_name),
      fullname: app.candidate.full_name,
    };
    const override = args.perRecipient?.[app.id];
    const dynamicVars = {
      custom: args.customMessage ?? "",
      dates: override?.dates ?? args.dates ?? "",
      times: override?.times ?? args.times ?? "",
    };
    const renderedSubject = renderTemplate(args.customSubject || template.subject, { ...orgVars, ...candidateVars, ...dynamicVars });
    const subject = tagSubjectWithApp(renderedSubject, app.id);
    const body = renderTemplate(template.body_html, { ...orgVars, ...candidateVars, ...dynamicVars });
    emails.push({
      application_id: app.id,
      to_email: app.candidate.email,
      to_name: app.candidate.full_name,
      subject,
      body,
    });
  }

  return { ok: true, emails, invalidCount: invalid };
}

/**
 * Variante pour les emails libres : sans template, le sujet et le corps HTML
 * sont fournis tels quels. Le sujet est taggué avec [#APP-xxxxx] pour le matching.
 */
export async function prepareFreeformEmailAction(args: {
  applicationIds: string[];
  subject: string;
  body_html: string;
}): Promise<PrepareResult> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  if (!args.applicationIds || args.applicationIds.length === 0) {
    return { error: "Aucun candidat sélectionné." };
  }
  if (!args.subject?.trim()) return { error: "Sujet requis." };
  if (!args.body_html?.trim()) return { error: "Corps requis." };

  const { data: apps } = await supabase
    .from("applications")
    .select("id, candidate:candidates(email, full_name)")
    .in("id", args.applicationIds);

  type AppRow = { id: string; candidate: { email: string; full_name: string } | null };
  const emails: PreparedEmail[] = [];
  let invalid = 0;
  for (const app of (apps ?? []) as unknown as AppRow[]) {
    if (!app.candidate?.email) {
      invalid += 1;
      continue;
    }
    emails.push({
      application_id: app.id,
      to_email: app.candidate.email,
      to_name: app.candidate.full_name,
      subject: tagSubjectWithApp(args.subject, app.id),
      body: args.body_html,
    });
  }
  return { ok: true, emails, invalidCount: invalid };
}

export async function logEmailSentAction(
  applicationId: string,
  subject: string,
  body: string,
  provider = "emailjs",
) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const admin = createAdminClient();

  // Synthetic message-id used to thread future replies (set in In-Reply-To by the recipient).
  const messageIdHeader = `<${randomUUID()}@caftan-rh.local>`;

  // Find or create thread for this application + subject_root.
  const root = subjectRoot(subject);
  let threadId: string | null = null;
  if (root) {
    const { data: existing } = await admin
      .from("email_threads")
      .select("id")
      .eq("application_id", applicationId)
      .ilike("subject_root", root)
      .limit(1)
      .maybeSingle();
    if (existing?.id) threadId = (existing as { id: string }).id;
    else {
      const { data: created } = await admin
        .from("email_threads")
        .insert({
          application_id: applicationId,
          subject_root: root,
          last_message_at: new Date().toISOString(),
          message_count: 0,
        })
        .select("id")
        .single();
      threadId = (created as { id: string } | null)?.id ?? null;
    }
  }

  await supabase.from("messages").insert({
    application_id: applicationId,
    direction: "outbound",
    sender_id: profile.id,
    subject,
    body: body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000),
    email_provider_id: provider,
    message_id_header: messageIdHeader,
    thread_id: threadId,
  });

  if (threadId) {
    const { data: t } = await admin
      .from("email_threads")
      .select("message_count")
      .eq("id", threadId)
      .single();
    const count = ((t as { message_count?: number } | null)?.message_count ?? 0) + 1;
    await admin
      .from("email_threads")
      .update({ last_message_at: new Date().toISOString(), message_count: count })
      .eq("id", threadId);
  }

  await logActivity({
    kind: "email.sent",
    targetType: "application",
    targetId: applicationId,
    description: `Email envoyé : ${subject}`.slice(0, 200),
    actorId: profile.id,
    actorLabel: profile.full_name ?? profile.email ?? null,
    data: { provider, subject, message_id_header: messageIdHeader },
  });
  revalidatePath("/rh", "layout");
  return { ok: true };
}

export async function saveTemplateAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const slug = String(formData.get("slug") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body_html = String(formData.get("body_html") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!slug || !subject || !body_html) return { error: "Slug, sujet et corps requis." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .update({ subject, body_html, label })
    .eq("slug", slug);
  if (error) return { error: error.message };
  revalidatePath("/rh/templates");
  return { ok: true };
}
