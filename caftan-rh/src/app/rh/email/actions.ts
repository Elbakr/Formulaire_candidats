"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { renderTemplate, firstNameOf, type OrgVars } from "@/lib/email-templates";

type PrepareArgs = {
  applicationIds: string[];
  templateSlug: string;
  customMessage?: string | null;
  dates?: string | null;
  times?: string | null;
  customSubject?: string | null;
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
    const dynamicVars = {
      custom: args.customMessage ?? "",
      dates: args.dates ?? "",
      times: args.times ?? "",
    };
    const subject = renderTemplate(args.customSubject || template.subject, { ...orgVars, ...candidateVars, ...dynamicVars });
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

export async function logEmailSentAction(
  applicationId: string,
  subject: string,
  body: string,
  provider = "emailjs",
) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  await supabase.from("messages").insert({
    application_id: applicationId,
    direction: "outbound",
    sender_id: profile.id,
    subject,
    body: body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000),
    email_provider_id: provider,
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
