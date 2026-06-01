// Karim 2026-06-01 : helper DocuSeal pour la lettre de rupture amiable 402.00.
// Decoupe en 2 etapes :
//   1. createTerminationTemplate(opts) → POST /templates/html → templateId
//   2. createTerminationSubmission(templateId, signers) → POST /submissions
//      → submissionId + signing URLs (embed_src) a integrer dans le mail.
//
// DocuSeal genere un VRAI PDF A4 a partir du HTML + les zones signature
// sont legalement contraignantes (eIDAS) une fois cliquees par les parties.

import "server-only";
import { renderTerminationLetterForDocuSeal, type TerminationLetterData } from "@/lib/termination-letter";

export interface TerminationTemplateResult {
  ok: true;
  templateId: number;
  templateName: string;
}
export interface DocusealError {
  ok: false;
  error: string;
}

export async function createTerminationTemplate(
  opts: TerminationLetterData & {
    templateNameSuffix?: string;
    employerSignatureDataUrl?: string | null;
  },
): Promise<TerminationTemplateResult | DocusealError> {
  const baseUrl = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, error: "DocuSeal non configuré (DOCUSEAL_BASE_URL/API_KEY)" };

  const html = renderTerminationLetterForDocuSeal(opts, {
    employerSignatureDataUrl: opts.employerSignatureDataUrl,
  });
  const safeName = opts.employee_full_name.replace(/\s+/g, "_");
  const templateName = `rupture_amiable_${safeName}_${opts.templateNameSuffix ?? Date.now()}`;

  const res = await fetch(`${baseUrl}/templates/html`, {
    method: "POST",
    headers: {
      "X-Auth-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: templateName, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `DocuSeal /templates/html HTTP ${res.status}: ${text.slice(0, 400)}` };
  }
  const data = (await res.json()) as { id: number; name: string };
  return { ok: true, templateId: data.id, templateName: data.name };
}

export interface TerminationSubmissionResult {
  ok: true;
  submissionId: number;
  signingUrls: Array<{ role: string; email: string; url?: string }>;
}

export async function createTerminationSubmission(opts: {
  templateId: number;
  employeeName: string;
  employeeEmail: string;
  employerName: string;
  employerEmail: string;
  metadata?: Record<string, string>;
  replyTo?: string;
  preSigned?: boolean;
}): Promise<TerminationSubmissionResult | DocusealError> {
  const baseUrl = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, error: "DocuSeal non configuré" };

  // Karim 2026-06-01 : si preSigned, l'employeur signature est deja embedded
  // dans le template (image) → 1 seul signataire (Employee). Sinon dual.
  const submitters = opts.preSigned
    ? [
        {
          role: "Employee",
          name: opts.employeeName,
          email: opts.employeeEmail,
        },
      ]
    : [
        {
          role: "Employer",
          name: opts.employerName,
          email: opts.employerEmail,
        },
        {
          role: "Employee",
          name: opts.employeeName,
          email: opts.employeeEmail,
        },
      ];

  const res = await fetch(`${baseUrl}/submissions`, {
    method: "POST",
    headers: {
      "X-Auth-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_id: opts.templateId,
      send_email: false,
      order: "preserved",
      reply_to: opts.replyTo ?? "hr@caftanfactory.com",
      submitters,
      metadata: opts.metadata,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `DocuSeal /submissions HTTP ${res.status}: ${text.slice(0, 400)}` };
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
}

/**
 * Karim 2026-06-01 : recupere le PDF final signe depuis DocuSeal.
 * Renvoie l'URL signed du PDF audit (avec signatures + timestamp legal).
 */
export async function getTerminationSignedPdfUrl(
  submissionId: number,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const baseUrl = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, error: "DocuSeal non configuré" };
  const res = await fetch(`${baseUrl}/submissions/${submissionId}`, {
    method: "GET",
    headers: { "X-Auth-Token": apiKey },
  });
  if (!res.ok) return { ok: false, error: `DocuSeal HTTP ${res.status}` };
  const data = (await res.json()) as {
    status?: string;
    audit_log_url?: string;
    combined_document_url?: string;
    documents?: Array<{ url?: string }>;
  };
  const pdfUrl = data.combined_document_url ?? data.documents?.[0]?.url;
  if (!pdfUrl) return { ok: false, error: "PDF non disponible (signatures incomplètes)" };
  return { ok: true, url: pdfUrl };
}
