"use server";

// Karim 2026-05-29 : action server "Envoyer contrat a signer via DocuSeal".
// Charge le template Markdown depuis BD, render avec les donnees employee
// reelles, POST /templates/html sur DocuSeal, puis POST /submissions avec
// 2 signataires (employer + employee). Persist en BD un employee_contracts
// avec docuseal_submission_id pour tracking ulterieur (webhook).

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createDocusealTemplateFromContract,
  createSubmissionForContract,
} from "@/lib/docuseal-flow";
import { EMPLOYER_ORGS, type EmployerOrgKey } from "@/lib/contract-renderer";

type Args = {
  employeeId: string;
  templateCode: "employee" | "employee_pt" | "student";
  orgKey: EmployerOrgKey;
  employerEmail: string;
};

export async function sendContractViaDocusealAction(
  args: Args,
): Promise<{ ok?: true; error?: string; submissionId?: number }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.employeeId) return { error: "Employee manquant." };
  if (!args.employerEmail || !/.+@.+\..+/.test(args.employerEmail)) {
    return { error: "Email employeur invalide." };
  }

  const supabase = await createClient();

  // 1. Charge l employee + son site primaire
  const { data: empRaw } = await supabase
    .from("employees")
    .select("id, full_name, email, nrn, address, postal_code, city, job_title, weekly_hours, hourly_rate, contract_type, start_date, end_date, iban, bic")
    .eq("id", args.employeeId)
    .maybeSingle();
  if (!empRaw) return { error: "Employé introuvable." };
  const employee = empRaw as {
    id: string;
    full_name: string;
    email: string | null;
    nrn: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
    job_title: string | null;
    weekly_hours: number | null;
    hourly_rate: number | null;
    contract_type: string | null;
    start_date: string | null;
    end_date: string | null;
    iban: string | null;
    bic: string | null;
  };
  if (!employee.email) return { error: "Email employé manquant - complète la fiche d'abord." };

  // Site primaire (optionnel)
  const today = new Date().toISOString().slice(0, 10);
  const { data: assignRaw } = await supabase
    .from("site_assignments")
    .select("site:sites(id, code, name, address, city)")
    .eq("employee_id", args.employeeId)
    .eq("is_primary", true)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .maybeSingle();
  const primarySite = (assignRaw as { site: { id: string; code: string; name: string; address: string | null; city: string | null } | null } | null)?.site ?? null;

  // 2. Charge le template Markdown
  const { data: tplRaw } = await supabase
    .from("contract_templates")
    .select("code, name, body_markdown")
    .eq("code", args.templateCode)
    .eq("is_active", true)
    .maybeSingle();
  if (!tplRaw) return { error: `Template ${args.templateCode} introuvable ou inactif.` };
  const template = tplRaw as { code: string; name: string; body_markdown: string };

  // 3. Cree le template DocuSeal a partir du markdown rendu
  const orgInfo = EMPLOYER_ORGS[args.orgKey];
  const tplResult = await createDocusealTemplateFromContract({
    templateCode: args.templateCode,
    templateBodyMarkdown: template.body_markdown,
    employeeData: employee,
    employerOrg: args.orgKey,
    primarySite: primarySite ? { code: primarySite.code, name: primarySite.name, address: primarySite.address, city: primarySite.city } : null,
  });
  if (!tplResult.ok) return { error: tplResult.error };

  // 4. Cree la submission avec 2 signataires
  const subResult = await createSubmissionForContract({
    templateId: tplResult.templateId,
    employeeName: employee.full_name,
    employeeEmail: employee.email,
    employerName: orgInfo.representative,
    employerEmail: args.employerEmail,
    metadata: {
      employee_id: employee.id,
      template_code: args.templateCode,
      org_key: args.orgKey,
      sent_by: profile.full_name ?? "RH",
    },
  });
  if (!subResult.ok) return { error: subResult.error };

  // 5. Persist en employee_contracts (track docuseal_submission_id)
  try {
    await supabase.from("employee_contracts").insert({
      employee_id: employee.id,
      contract_kind: args.templateCode === "student" ? "Étudiant" : "CDD",
      template_code: args.templateCode,
      docuseal_submission_id: subResult.submissionId,
      docuseal_status: "sent",
      prepared_at: new Date().toISOString(),
      prepared_by: profile.full_name ?? "RH",
      employer_org_key: args.orgKey,
    });
  } catch (e) {
    // table peut avoir des colonnes manquantes (employer_org_key, template_code)
    // - ce n est pas bloquant pour la signature DocuSeal qui est deja envoyee
    console.warn("[sendContractViaDocuseal] insert employee_contracts:", e);
  }

  revalidatePath(`/planning/employees/${args.employeeId}`);
  revalidatePath(`/planning/employees/${args.employeeId}/contract`);
  return { ok: true, submissionId: subResult.submissionId };
}
