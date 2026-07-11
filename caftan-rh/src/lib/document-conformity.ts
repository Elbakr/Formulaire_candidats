import "server-only";

// Karim 2026-07-11 : contrôle IA de CONFORMITÉ + VALIDITÉ des documents déposés
// dans la valise (Limosa L1, certificat A1, titre de séjour, CI, diplôme…). L'IA
// confirme que le document est lisible/conforme, valide (non expiré), et en extrait
// la DATE D'EXPIRATION -> stockée sur `documents` (alimente les rappels échelonnés).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  callAnthropicPdf,
  callAnthropicVision,
  isAnthropicConfigured,
} from "@/lib/ai/providers/anthropic";

const SYSTEM = `Tu es un contrôleur documentaire RH en Belgique. On te fournit UN document officiel déposé dans le dossier d'un travailleur ou candidat (ex. Limosa L1, certificat A1, titre de séjour, carte d'identité, diplôme, contrat, attestation…).

Vérifie :
- LISIBILITÉ & CONFORMITÉ : est-ce un document réel, lisible et cohérent (pas une page blanche, floue, tronquée ou hors-sujet) ?
- VALIDITÉ : le document est-il valide (non expiré, dates cohérentes) ?
- DATE D'EXPIRATION / fin de validité s'il y en a une.

Réponds STRICTEMENT en JSON, sans texte autour :
{"conform": true|false, "valid": true|false, "doc_kind": "type détecté (fr)", "expiry_date": "YYYY-MM-DD"|null, "note": "remarque courte en français (problème détecté, ou 'OK')"}`;

export type DocConformity = {
  conform: boolean;
  valid: boolean;
  doc_kind: string | null;
  expiry_date: string | null;
  note: string | null;
  status: "conforme" | "non_conforme" | "a_verifier";
};

export type ConformityBatchResult = {
  checked: number;
  conforme: number;
  nonConforme: number;
  aVerifier: number;
  withExpiry: number;
  issues: Array<{ name: string; docKind: string; note: string }>;
  errors: Array<{ name: string; error: string }>;
};

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t : null;
}
function iso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

async function resolveModel(admin: SupabaseClient): Promise<string> {
  try {
    const { data } = await admin.from("org_settings").select("ai_model_fast").eq("id", 1).maybeSingle();
    const m = (data as { ai_model_fast?: string | null } | null)?.ai_model_fast;
    if (m && m.trim()) return m.trim();
  } catch {
    /* fallback */
  }
  return "claude-sonnet-4-6";
}

/** Contrôle IA d'UN document (PDF ou image). Stocke le résultat sur `documents`. */
export async function checkDocumentConformity(
  admin: SupabaseClient,
  doc: { id: string; storage_path: string; mime_type: string | null },
): Promise<{ ok: boolean; error?: string; result?: DocConformity }> {
  if (!isAnthropicConfigured()) return { ok: false, error: "IA indisponible (clé absente)." };
  if (/^https?:\/\//i.test(doc.storage_path)) return { ok: false, error: "document externe (URL) non contrôlable." };

  const { data: blob, error } = await admin.storage.from("documents").download(doc.storage_path);
  if (error || !blob) return { ok: false, error: "fichier introuvable dans le stockage." };
  const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const isPdf = /pdf/i.test(doc.mime_type ?? "") || doc.storage_path.toLowerCase().endsWith(".pdf");
  const model = await resolveModel(admin);

  let out: unknown;
  try {
    if (isPdf) {
      const r = await callAnthropicPdf({
        model,
        system: SYSTEM,
        user: "Contrôle ce document et réponds en JSON.",
        pdfBase64: b64,
        expectsJson: true,
        maxTokens: 400,
      });
      out = r.output;
    } else {
      const media = /png/i.test(doc.mime_type ?? "")
        ? "image/png"
        : /webp/i.test(doc.mime_type ?? "")
          ? "image/webp"
          : "image/jpeg";
      const r = await callAnthropicVision({
        model,
        system: SYSTEM,
        user: "Contrôle ce document et réponds en JSON.",
        images: [{ mediaType: media, base64: b64 }],
        expectsJson: true,
        maxTokens: 400,
      });
      out = r.output;
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const o = (out ?? {}) as Record<string, unknown>;
  const conform = o.conform === true;
  const valid = o.valid === true;
  const expiry_date = iso(o.expiry_date);
  const status: DocConformity["status"] = !conform ? "non_conforme" : !valid ? "a_verifier" : "conforme";
  const result: DocConformity = {
    conform,
    valid,
    doc_kind: strOrNull(o.doc_kind),
    expiry_date,
    note: strOrNull(o.note),
    status,
  };

  try {
    const patch: Record<string, unknown> = {
      ia_status: status,
      ia_note: result.note,
      ia_checked_at: new Date().toISOString(),
    };
    if (expiry_date) patch.expiry_date = expiry_date;
    await admin.from("documents").update(patch).eq("id", doc.id);
  } catch {
    /* best-effort */
  }
  return { ok: true, result };
}

/** Contrôle IA en LOT des documents non encore contrôlés (cap). */
export async function checkAllDocumentsConformity(
  admin: SupabaseClient,
  opts?: { max?: number },
): Promise<ConformityBatchResult> {
  const max = opts?.max ?? 20;
  const { data: docsRaw } = await admin
    .from("documents")
    .select("id, storage_path, mime_type, kind, employee_id, candidate_id")
    .is("ia_checked_at", null)
    .not("storage_path", "ilike", "http%")
    .order("created_at", { ascending: false })
    .limit(max);
  const docs = (docsRaw ?? []) as Array<{
    id: string;
    storage_path: string;
    mime_type: string | null;
    kind: string | null;
    employee_id: string | null;
    candidate_id: string | null;
  }>;

  const res: ConformityBatchResult = {
    checked: 0,
    conforme: 0,
    nonConforme: 0,
    aVerifier: 0,
    withExpiry: 0,
    issues: [],
    errors: [],
  };
  if (docs.length === 0) return res;

  // Noms (employé/candidat) pour les libellés.
  const empIds = Array.from(new Set(docs.map((d) => d.employee_id).filter(Boolean))) as string[];
  const candIds = Array.from(new Set(docs.map((d) => d.candidate_id).filter(Boolean))) as string[];
  const nameById = new Map<string, string>();
  if (empIds.length) {
    const { data } = await admin.from("employees").select("id, full_name").in("id", empIds);
    for (const e of (data ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(e.id, e.full_name ?? "?");
  }
  if (candIds.length) {
    const { data } = await admin.from("candidates").select("id, full_name").in("id", candIds);
    for (const e of (data ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(e.id, e.full_name ?? "?");
  }
  const nameOf = (d: (typeof docs)[number]) =>
    (d.employee_id && nameById.get(d.employee_id)) || (d.candidate_id && nameById.get(d.candidate_id)) || "?";

  const results = await Promise.all(
    docs.map(async (d) => ({ d, r: await checkDocumentConformity(admin, d) })),
  );

  for (const { d, r } of results) {
    const name = nameOf(d);
    if (!r.ok || !r.result) {
      res.errors.push({ name, error: r.error ?? "contrôle échoué" });
      continue;
    }
    res.checked += 1;
    const c = r.result;
    if (c.status === "conforme") res.conforme += 1;
    else if (c.status === "non_conforme") res.nonConforme += 1;
    else res.aVerifier += 1;
    if (c.expiry_date) res.withExpiry += 1;
    if (c.status !== "conforme") {
      res.issues.push({ name, docKind: c.doc_kind ?? d.kind ?? "document", note: c.note ?? "à vérifier" });
    }
  }
  return res;
}

export function formatConformityBody(r: ConformityBatchResult): string {
  const head =
    `Contrôle conformité IA : ${r.checked} document(s) analysé(s) — ${r.conforme} conforme(s), ` +
    `${r.nonConforme} non conforme(s), ${r.aVerifier} à vérifier, ${r.withExpiry} avec date d'expiration détectée. ${r.errors.length} erreur(s).`;
  const issues = r.issues.length
    ? "\n\n⚠️ À vérifier :\n" + r.issues.map((i) => `• ${i.name} — ${i.docKind} : ${i.note}`).join("\n")
    : "";
  const errs = r.errors.length ? "\n\nErreurs :\n" + r.errors.map((e) => `• ${e.name} : ${e.error}`).join("\n") : "";
  return head + issues + errs;
}
