// Karim 2026-05-29 : route admin pour generer le HTML d un contrat exactement
// comme le module docuseal-flow.ts le fait (avec markdownToHtml, encadre titre,
// bloc parties Entre/Et, etc.). Permet aux scripts de test de reproduire le
// VRAI rendu du bouton UI.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createDocusealTemplateFromContract, createSubmissionForContract } from "@/lib/docuseal-flow";
import type { EmployerOrgKey } from "@/lib/contract-renderer";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    employeeId: string;
    templateCode: "employee" | "employee_pt" | "student";
    orgKey?: EmployerOrgKey;
    useStoredSignature?: boolean;
    sendSubmission?: boolean;
  };

  const admin = createAdminClient();
  const { data: empRaw } = await admin
    .from("employees")
    .select("*")
    .eq("id", body.employeeId)
    .maybeSingle();
  if (!empRaw) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  const employee = empRaw as Parameters<typeof createDocusealTemplateFromContract>[0]["employeeData"] & { email?: string; preferred_language?: string };

  const { data: tplRaw } = await admin
    .from("contract_templates")
    .select("body_markdown")
    .eq("code", body.templateCode)
    .maybeSingle();
  if (!tplRaw) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const templateBodyMarkdown = (tplRaw as { body_markdown: string }).body_markdown;

  // Signature stockee Karim (pour tester pré-signé) si demandé
  let employerSignatureDataUrl: string | null = null;
  if (body.useStoredSignature) {
    const { data: profRaw } = await admin
      .from("profiles")
      .select("signature_data_url")
      .eq("id", "ae584efa-0c7d-4ccf-be30-3f49a28fb0c5")
      .maybeSingle();
    employerSignatureDataUrl = (profRaw as { signature_data_url: string | null } | null)?.signature_data_url ?? null;
  }

  const tplResult = await createDocusealTemplateFromContract({
    templateCode: body.templateCode,
    templateBodyMarkdown,
    employeeData: employee,
    employerOrg: body.orgKey ?? "amd_megastore",
    primarySite: null,
    employerSignatureDataUrl,
  });
  if (!tplResult.ok) return NextResponse.json({ error: tplResult.error }, { status: 500 });

  if (!body.sendSubmission) {
    return NextResponse.json({ templateId: tplResult.templateId, templateName: tplResult.templateName });
  }

  const subResult = await createSubmissionForContract({
    templateId: tplResult.templateId,
    employeeName: employee.full_name,
    employeeEmail: employee.email ?? "elbazikarim@gmail.com",
    employerName: "Karim Elbazi",
    employerEmail: "elbazikarim@gmail.com",
    language: (employee.preferred_language === "nl" || employee.preferred_language === "en") ? employee.preferred_language : "fr",
    preSigned: !!employerSignatureDataUrl,
    replyTo: "hr@caftanfactory.com",
    metadata: { employee_id: body.employeeId, source: "api_preview_admin" },
  });
  if (!subResult.ok) return NextResponse.json({ error: subResult.error }, { status: 500 });
  return NextResponse.json({
    templateId: tplResult.templateId,
    submissionId: subResult.submissionId,
    signingUrls: subResult.signingUrls,
  });
}
