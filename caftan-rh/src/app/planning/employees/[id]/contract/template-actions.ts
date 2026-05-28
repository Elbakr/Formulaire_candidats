"use server";

// Karim 2026-05-22 : server actions pour generer un contrat a partir d un
// contract_template + lien magique signature envoye par email.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { renderContractTemplate, buildContractVariables } from "@/lib/contract-renderer";

export async function listContractTemplatesAction(): Promise<{
  templates: Array<{ id: string; code: string; name: string; kind: string }>;
  error?: string;
}> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_templates")
    .select("id, code, name, kind")
    .eq("is_active", true)
    .order("name");
  if (error) return { templates: [], error: error.message };
  return { templates: (data ?? []) as Array<{ id: string; code: string; name: string; kind: string }> };
}

export async function previewContractFromTemplateAction(input: {
  employeeId: string;
  templateId: string;
  overrides?: Record<string, string | number | null>;
}): Promise<{
  rendered?: string;
  templateName?: string;
  variables?: Record<string, string | number | null | undefined>;
  error?: string;
}> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const [{ data: emp }, { data: tpl }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, full_name, nrn, address, postal_code, city, job_title, weekly_hours, hourly_rate, contract_type, start_date, end_date, iban, bic",
      )
      .eq("id", input.employeeId)
      .maybeSingle(),
    supabase
      .from("contract_templates")
      .select("id, name, body_markdown")
      .eq("id", input.templateId)
      .maybeSingle(),
  ]);
  if (!emp) return { error: "Employé introuvable" };
  if (!tpl) return { error: "Template introuvable" };

  // Charge site primaire (1ere affectation primary active)
  const todayISO = new Date().toISOString().slice(0, 10);
  const { data: assigns } = await supabase
    .from("site_assignments")
    .select("site_id, is_primary")
    .eq("employee_id", input.employeeId)
    .eq("is_primary", true)
    .lte("start_date", todayISO)
    .or(`end_date.is.null,end_date.gte.${todayISO}`)
    .limit(1);
  let primarySite: { code: string; name: string; address?: string | null; city?: string | null } | null = null;
  if ((assigns ?? []).length > 0) {
    const siteId = (assigns![0] as { site_id: string }).site_id;
    const { data: s } = await supabase
      .from("sites")
      .select("code, name, address, city")
      .eq("id", siteId)
      .maybeSingle();
    if (s) primarySite = s as typeof primarySite;
  }

  const variables = buildContractVariables({
    employee: emp as Parameters<typeof buildContractVariables>[0]["employee"],
    primarySite,
    overrides: input.overrides,
  });
  const rendered = renderContractTemplate((tpl as { body_markdown: string }).body_markdown, variables);
  return { rendered, templateName: (tpl as { name: string }).name, variables };
}

export async function createContractAndSendForSignatureAction(input: {
  employeeId: string;
  templateId: string;
  overrides?: Record<string, string | number | null>;
}): Promise<{
  ok?: boolean;
  contractId?: string;
  signingUrl?: string;
  mailStatus?: number;
  error?: string;
}> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  // 1. Render preview
  const preview = await previewContractFromTemplateAction(input);
  if (preview.error || !preview.rendered) {
    return { error: preview.error ?? "Echec du rendu" };
  }
  const variables = preview.variables ?? {};

  // 2. Charge employe (pour email)
  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, email, address, postal_code, city, nrn, weekly_hours, contract_type, start_date, end_date, hourly_rate, job_title, birth_date, birth_place, profile_id")
    .eq("id", input.employeeId)
    .maybeSingle();
  if (!emp) return { error: "Employé introuvable" };
  const employeeEmail = (emp as { email: string | null }).email;
  if (!employeeEmail) return { error: "Email de l'employé manquant. Renseigne-le sur sa fiche avant l'envoi." };

  // 3. Token signature
  const signingToken = randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + 14);
  const expiresISO = expires.toISOString();

  // 4. Insert employee_contracts
  const startDate = String(variables.start_date ?? new Date().toISOString().slice(0, 10));
  const weeklyHours = Number(variables.weekly_hours ?? 38);
  const grossMonthly = Number(variables.gross_salary ?? 0) || null;
  const { data: row, error: insErr } = await supabase
    .from("employee_contracts")
    .insert({
      employee_id: input.employeeId,
      full_name: (emp as { full_name: string }).full_name,
      nrn: (emp as { nrn: string | null }).nrn ?? null,
      address: (emp as { address: string | null }).address ?? null,
      postal_code: (emp as { postal_code: string | null }).postal_code ?? null,
      city: (emp as { city: string | null }).city ?? null,
      contract_kind: (emp as { contract_type: string | null }).contract_type ?? "CDI",
      start_date: startDate,
      end_date: variables.end_date ? String(variables.end_date) : null,
      weekly_hours: weeklyHours,
      position_title: String(variables.position ?? "Employé"),
      workplace: String(variables.workplace ?? "Schaerbeek"),
      gross_monthly_salary: grossMonthly,
      joint_committee: String(variables.paritary_commission ?? ""),
      status: "ready_to_sign",
      prepared_at: new Date().toISOString(),
      template_id: input.templateId,
      signing_token: signingToken,
      signing_token_expires_at: expiresISO,
      rendered_body: preview.rendered,
    })
    .select("id")
    .single();
  if (insErr) return { error: insErr.message };
  const contractId = (row as { id: string }).id;

  // 5. Envoi mail signature via EmailJS
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://children-joined-dealers-nancy.trycloudflare.com";
  const signingUrl = `${baseUrl}/sign/${signingToken}`;
  let mailStatus = 0;
  try {
    const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
    const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
    const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
    if (SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY) {
      const empName = (emp as { full_name: string }).full_name;
      const subject = `CaftanRH — Ton contrat de travail à signer (${preview.templateName ?? "contrat"})`;
      const body = `Bonjour ${empName.split(" ")[0]},\n\nTon contrat de travail est prêt. Pour le lire et le signer numériquement, ouvre ce lien :\n\n${signingUrl}\n\nLe lien est valide 14 jours.\n\nLa signature se fait au doigt sur ton téléphone ou à la souris sur ordinateur. Une fois signé, tu recevras une copie PDF par mail.\n\nÀ bientôt,\nCaftanRH`;
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify({
          service_id: SERVICE_ID,
          template_id: TEMPLATE_ID,
          user_id: PUBLIC_KEY,
          template_params: {
            to_email: employeeEmail,
            email: employeeEmail,
            recipient: employeeEmail,
            user_email: employeeEmail,
            candidate_email: employeeEmail,
            to: employeeEmail,
            to_name: empName,
            name: empName,
            from_name: "CaftanRH",
            reply_to: "hr@caftanfactory.com",
            subject,
            message: body,
            html_message: body.replace(/\n/g, "<br>"),
            body,
            html: body.replace(/\n/g, "<br>"),
            content: body,
          },
        }),
      });
      mailStatus = res.status;
    }
  } catch {
    /* mail failed but contract created */
  }

  revalidatePath(`/planning/employees/${input.employeeId}/contract`);
  return { ok: true, contractId, signingUrl, mailStatus };
}
