// Karim 2026-05-29 : client DocuSeal pour signature electronique gratuite.
//
// Quand active (SIGNATURE_PROVIDER=docuseal + DOCUSEAL_BASE_URL/API_KEY
// settes), CaftanRH cree des "submissions" DocuSeal a partir d un template
// PDF. L employee recoit un email avec lien de signature. Le webhook
// /api/docuseal/webhook met a jour le statut en BD.
//
// API doc : https://www.docuseal.com/docs/api

export type DocusealSubmitter = {
  email: string;
  name?: string;
  role?: string; // "Employee" | "Employer"
  fields?: Array<{ name: string; default_value?: string; readonly?: boolean }>;
};

export type DocusealCreateSubmissionArgs = {
  templateId: number; // id du template DocuSeal (cree dans l UI Admin)
  submitters: DocusealSubmitter[];
  sendEmail?: boolean;
  metadata?: Record<string, string>;
};

export type DocusealSubmission = {
  id: number;
  template_id: number;
  status: "pending" | "sent" | "opened" | "completed" | "declined";
  audit_log_url?: string;
  combined_document_url?: string;
  submitters: Array<{
    id: number;
    email: string;
    status: string;
    sent_at?: string;
    opened_at?: string;
    completed_at?: string;
    signing_url?: string;
  }>;
};

function getConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.DOCUSEAL_BASE_URL;
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

/**
 * Cree une submission DocuSeal et envoie le mail de signature aux submitters.
 * @returns submission_id pour persistance + signing_url pour preview admin
 */
export async function createDocusealSubmission(
  args: DocusealCreateSubmissionArgs,
): Promise<{ ok: true; submission: DocusealSubmission } | { ok: false; error: string }> {
  const cfg = getConfig();
  if (!cfg) {
    return { ok: false, error: "DocuSeal non configure (DOCUSEAL_BASE_URL/API_KEY manquants)" };
  }

  try {
    const res = await fetch(`${cfg.baseUrl}/api/submissions`, {
      method: "POST",
      headers: {
        "X-Auth-Token": cfg.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_id: args.templateId,
        send_email: args.sendEmail ?? true,
        submitters: args.submitters,
        metadata: args.metadata,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `DocuSeal HTTP ${res.status}: ${text}` };
    }
    const data = (await res.json()) as DocusealSubmission;
    return { ok: true, submission: data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Recupere le statut d une submission existante.
 */
export async function getDocusealSubmission(
  submissionId: number,
): Promise<{ ok: true; submission: DocusealSubmission } | { ok: false; error: string }> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, error: "DocuSeal non configure" };
  try {
    const res = await fetch(`${cfg.baseUrl}/api/submissions/${submissionId}`, {
      headers: { "X-Auth-Token": cfg.apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `DocuSeal HTTP ${res.status}: ${text}` };
    }
    const data = (await res.json()) as DocusealSubmission;
    return { ok: true, submission: data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Liste tous les templates DocuSeal disponibles (pour debug + selection RH).
 */
export async function listDocusealTemplates(): Promise<
  { ok: true; templates: Array<{ id: number; name: string; slug: string }> } | { ok: false; error: string }
> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, error: "DocuSeal non configure" };
  try {
    const res = await fetch(`${cfg.baseUrl}/api/templates`, {
      headers: { "X-Auth-Token": cfg.apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `DocuSeal HTTP ${res.status}: ${text}` };
    }
    const data = (await res.json()) as { data: Array<{ id: number; name: string; slug: string }> };
    return { ok: true, templates: data.data ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Verifie la signature HMAC d un webhook entrant DocuSeal.
 */
export function verifyDocusealWebhook(
  signatureHeader: string | null,
  rawBody: string,
): boolean {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader) return false;
  // DocuSeal envoie HMAC-SHA256(body, secret) en hex
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
