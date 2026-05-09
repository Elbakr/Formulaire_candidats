"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { sendEmail } from "@/lib/emails";
import { renderTemplate, firstNameOf, type OrgVars } from "@/lib/email-templates";

type SendArgs = {
  applicationIds: string[];
  templateSlug: string;
  customMessage?: string | null;
  dates?: string | null;
  times?: string | null;
  customSubject?: string | null;
};

type Result = {
  ok?: boolean;
  error?: string;
  sent?: number;
  failures?: Array<{ application_id: string; error: string }>;
};

export async function sendCustomEmailAction(args: SendArgs): Promise<Result> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
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
  const template = tmpl as unknown as { slug: string; label: string; subject: string; body_html: string };
  const orgVars: OrgVars = {
    org_name: (org as { org_name?: string } | null)?.org_name ?? "Caftan Factory",
    org_email: (org as { org_email?: string } | null)?.org_email ?? "hr@caftanfactory.com",
    org_phone: (org as { org_phone?: string } | null)?.org_phone ?? "+32 468 59 61 00",
    org_whatsapp: (org as { org_whatsapp?: string } | null)?.org_whatsapp ?? "32468596100",
    org_address: (org as { org_address?: string } | null)?.org_address ?? "Rue de Brabant 230, 1030 Schaerbeek",
  };

  const failures: Array<{ application_id: string; error: string }> = [];
  let sent = 0;

  type AppRow = { id: string; candidate: { email: string; full_name: string } | null };
  for (const app of (apps ?? []) as unknown as AppRow[]) {
    if (!app.candidate?.email) {
      failures.push({ application_id: app.id, error: "Pas d'email candidat." });
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

    const r = await sendEmail({ to: app.candidate.email, subject, html: body, replyTo: orgVars.org_email });
    if (r?.error) {
      failures.push({ application_id: app.id, error: r.error });
      continue;
    }
    // Log dans messages (même si Resend a été skippé)
    await supabase.from("messages").insert({
      application_id: app.id,
      direction: "outbound",
      sender_id: profile.id,
      subject,
      body: body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000),
    });
    sent += 1;
  }

  revalidatePath("/rh", "layout");
  return { ok: true, sent, failures };
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
