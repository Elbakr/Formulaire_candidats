// Karim 2026-05-29 : flow complet d envoi d un contrat a signer via DocuSeal.
//
// Workflow (zero config manuelle dans DocuSeal UI) :
//   1. Render le markdown du contract_template avec les vraies donnees employee
//   2. Convertit le markdown rendu en HTML
//   3. POST /templates/html sur DocuSeal -> recupere template_id (cache 1h)
//   4. POST /submissions avec template_id + 2 signataires (employee + employer)
//   5. DocuSeal envoie les emails de signature
//   6. Webhook /api/docuseal/webhook met a jour la BD quand signe

import { renderContractTemplate, buildContractVariables, EMPLOYER_ORGS, type EmployerOrgKey } from "@/lib/contract-renderer";

/**
 * Convertit le markdown rendu en HTML simple pour DocuSeal.
 * Garde les retours a la ligne, gere les titres ##, listes, gras.
 */
function markdownToHtml(md: string): string {
  let html = md
    // Echappe HTML special
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Titres
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  // Gras
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italique
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Listes
  html = html.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
  // Paragraphes (lignes vides separent)
  const blocks = html.split(/\n\n+/);
  return blocks
    .map((b) => {
      if (b.startsWith("<h") || b.startsWith("<li")) return b;
      return `<p>${b.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

/**
 * Construit le HTML complet du contrat pour DocuSeal avec zones de signature.
 * DocuSeal detecte automatiquement les tags <signature-field>, <date-field>, etc.
 */
function buildContractHtmlForDocuseal(args: {
  contractBodyHtml: string;
  employerName: string;
  employeeName: string;
  contractLocation: string;
}): string {
  // Note : DocuSeal supporte des balises speciales pour les fields :
  //   <text-field name="..." submitter="..." />
  //   <signature-field name="..." submitter="..." />
  //   <date-field name="..." submitter="..." />
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Contrat</title>
<style>
  body { font-family: -apple-system, sans-serif; line-height: 1.5; max-width: 800px; margin: 2rem auto; padding: 0 2rem; color: #1a1a1a; }
  h1, h2, h3 { color: #111; }
  h1 { font-size: 1.6rem; border-bottom: 2px solid #ddd; padding-bottom: 0.5rem; }
  h2 { font-size: 1.3rem; margin-top: 2rem; }
  p { margin: 0.5em 0; }
  .signatures { margin-top: 4rem; display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; page-break-before: always; }
  .sig-block { border-top: 1px solid #888; padding-top: 1rem; }
  .sig-label { font-size: 0.85rem; color: #555; font-weight: bold; }
  .sig-field { min-height: 60px; }
</style>
</head>
<body>
${args.contractBodyHtml}

<div class="signatures">
  <div class="sig-block">
    <div class="sig-label">Pour l&apos;employeur (${args.employerName})</div>
    <div class="sig-field">
      <signature-field name="Signature employeur" role="Employer" required="true"></signature-field>
    </div>
    <date-field name="Date employeur" role="Employer" required="true"></date-field>
  </div>
  <div class="sig-block">
    <div class="sig-label">Pour le travailleur (${args.employeeName})</div>
    <div class="sig-field">
      <signature-field name="Signature employee" role="Employee" required="true"></signature-field>
    </div>
    <date-field name="Date employee" role="Employee" required="true"></date-field>
  </div>
</div>

<p style="text-align: center; margin-top: 3rem; font-size: 0.85rem; color: #777;">
  Fait à ${args.contractLocation} le <date-field name="Date contrat" default-value="${new Date().toISOString().slice(0, 10)}" role="Employer"></date-field>
</p>
</body>
</html>`;
}

/**
 * Cree un template DocuSeal a partir du markdown contractuel.
 */
export async function createDocusealTemplateFromContract(args: {
  templateCode: "employee" | "employee_pt" | "student";
  templateBodyMarkdown: string;
  employeeData: Parameters<typeof buildContractVariables>[0]["employee"];
  employerOrg: EmployerOrgKey;
  primarySite?: Parameters<typeof buildContractVariables>[0]["primarySite"];
}): Promise<{ ok: true; templateId: number; templateName: string } | { ok: false; error: string }> {
  const baseUrl = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, error: "DocuSeal non configure" };

  const vars = buildContractVariables({
    employee: args.employeeData,
    primarySite: args.primarySite,
    employerOrg: args.employerOrg,
  });
  const rendered = renderContractTemplate(args.templateBodyMarkdown, vars);
  const bodyHtml = markdownToHtml(rendered);
  const employerName = EMPLOYER_ORGS[args.employerOrg].name;
  const contractLocation = String(vars.contract_location ?? "Bruxelles");
  const fullHtml = buildContractHtmlForDocuseal({
    contractBodyHtml: bodyHtml,
    employerName,
    employeeName: args.employeeData.full_name,
    contractLocation,
  });

  const templateName = `${args.templateCode}_${args.employeeData.full_name.replace(/\s+/g, "_")}_${Date.now()}`;

  try {
    const res = await fetch(`${baseUrl}/templates/html`, {
      method: "POST",
      headers: {
        "X-Auth-Token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: templateName,
        html: fullHtml,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `DocuSeal /templates/html HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data = (await res.json()) as { id: number; name: string };
    return { ok: true, templateId: data.id, templateName: data.name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Cree une submission DocuSeal a partir d un template existant.
 * Envoie le mail de signature aux 2 signataires (employee + employer).
 */
export async function createSubmissionForContract(args: {
  templateId: number;
  employeeName: string;
  employeeEmail: string;
  employerName: string;
  employerEmail: string;
  metadata?: Record<string, string>;
}): Promise<{ ok: true; submissionId: number; signingUrls: Array<{ role: string; email: string; url?: string }> } | { ok: false; error: string }> {
  const baseUrl = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, error: "DocuSeal non configure" };

  try {
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "X-Auth-Token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_id: args.templateId,
        send_email: true,
        order: "preserved",
        submitters: [
          {
            role: "Employer",
            name: args.employerName,
            email: args.employerEmail,
          },
          {
            role: "Employee",
            name: args.employeeName,
            email: args.employeeEmail,
          },
        ],
        metadata: args.metadata,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `DocuSeal /submissions HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data = (await res.json()) as Array<{
      id: number;
      submission_id: number;
      role: string;
      email: string;
      embed_src?: string;
    }>;
    return {
      ok: true,
      submissionId: data[0]?.submission_id ?? 0,
      signingUrls: data.map((s) => ({ role: s.role, email: s.email, url: s.embed_src })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
