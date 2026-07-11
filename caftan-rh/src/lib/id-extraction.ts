import "server-only";

// Karim 2026-07-11 : extraction IA (Claude Vision) des données d'une carte
// d'identité belge / titre de séjour. RÉSULTAT À CONFIRMER PAR LE TRAVAILLEUR —
// on ne fait que PRÉ-REMPLIR, jamais écrire en dur sans validation humaine
// (cohérent avec la règle "auto-déclaré + confirmé"). Aucune décision de droit au
// travail ici : voir lib/work-authorization.ts + escalade admin.

import { createAdminClient } from "@/lib/supabase/server";
import { callAnthropicVision, callAnthropicPdf, isAnthropicConfigured } from "@/lib/ai/providers/anthropic";

export type ExtractedId = {
  doc_type: "ci_belge" | "titre_sejour" | "passeport" | "autre" | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  birth_date: string | null; // YYYY-MM-DD
  sex: string | null;
  birth_place: string | null;
  nationality: string | null;
  nrn: string | null; // numéro de registre national / national number
  doc_number: string | null;
  expiry_date: string | null; // YYYY-MM-DD
  /** Titre de séjour : mentionne-t-il l'accès au marché du travail ? */
  authorizes_work: boolean | null;
  confidence: number; // 0..1
};

export type ExtractResult =
  | { ok: true; data: ExtractedId; cost_usd: number }
  | { ok: false; error: string };

const SYSTEM = `Tu es un expert du contrôle documentaire RH en Belgique. On te fournit les images (recto/verso) d'un document d'identité : carte d'identité belge (eID), titre de séjour belge (carte A/B/C/F/K/L…, "Bijlage"/"Verblijfstitel"), ou passeport.

Extrais UNIQUEMENT ce qui est réellement visible. N'invente jamais. Si un champ est illisible ou absent, mets null.

Règles :
- Dates au format ISO strict "YYYY-MM-DD".
- "nrn" = numéro de registre national belge (11 chiffres, format 00.00.00-000.00) si présent, sinon null.
- "expiry_date" = date de fin de validité du document (très important pour un titre de séjour).
- "doc_type" : "ci_belge" (carte identité belge), "titre_sejour" (titre/carte de séjour), "passeport", ou "autre".
- "authorizes_work" : UNIQUEMENT pour un titre de séjour, true si le document indique l'accès au marché du travail / l'autorisation de travailler (ex. "Arbeidsmarkt : onbeperkt/beperkt", "Accès au marché du travail", "Titulaire autorisé à travailler"), false si explicitement interdit, sinon null. Pour une CI belge ou un passeport UE, mets null.
- "confidence" : ta confiance globale d'extraction entre 0 et 1.

Réponds STRICTEMENT en JSON, sans texte autour, avec exactement ces clés :
{"doc_type":...,"first_name":...,"last_name":...,"full_name":...,"birth_date":...,"sex":...,"birth_place":...,"nationality":...,"nrn":...,"doc_number":...,"expiry_date":...,"authorizes_work":...,"confidence":...}`;

function stripDataUrl(b64: string): string {
  const comma = b64.indexOf(",");
  return comma >= 0 ? b64.slice(comma + 1) : b64;
}
function mediaOf(mime: string): "image/jpeg" | "image/png" | "image/webp" {
  if (/png/i.test(mime)) return "image/png";
  if (/webp/i.test(mime)) return "image/webp";
  return "image/jpeg";
}
function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}
function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t : null;
}

/** Modèle vision configuré (fast), fallback Sonnet (vision, bon rapport coût/qualité). */
async function resolveModel(): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("org_settings").select("ai_model_fast").eq("id", 1).maybeSingle();
    const m = (data as { ai_model_fast?: string | null } | null)?.ai_model_fast;
    if (m && m.trim()) return m.trim();
  } catch {
    /* fallback */
  }
  return "claude-sonnet-4-6";
}

export async function extractIdDocument(
  images: Array<{ base64: string; mime: string }>,
): Promise<ExtractResult> {
  if (!isAnthropicConfigured()) {
    return { ok: false, error: "Extraction IA indisponible (clé API non configurée)." };
  }
  const imgs = images
    .filter((i) => i.base64)
    .slice(0, 3)
    .map((i) => ({ mediaType: mediaOf(i.mime), base64: stripDataUrl(i.base64) }));
  if (imgs.length === 0) return { ok: false, error: "Aucune image fournie." };

  try {
    const model = await resolveModel();
    const res = await callAnthropicVision({
      model,
      system: SYSTEM,
      user: "Extrais les champs de ce document d'identité selon le schéma JSON demandé.",
      images: imgs,
      expectsJson: true,
      maxTokens: 800,
    });
    return { ok: true, data: mapExtractionOutput(res.output), cost_usd: res.cost_usd };
  } catch (e) {
    return { ok: false, error: `Extraction impossible : ${(e as Error).message}` };
  }
}

/** Extraction depuis un PDF (CI stockée recto/verso fusionnée). Claude lit le PDF nativement. */
export async function extractIdDocumentFromPdf(pdfBase64: string): Promise<ExtractResult> {
  if (!isAnthropicConfigured()) {
    return { ok: false, error: "Extraction IA indisponible (clé API non configurée)." };
  }
  const data64 = stripDataUrl(pdfBase64 ?? "");
  if (!data64) return { ok: false, error: "PDF vide." };
  try {
    const model = await resolveModel();
    const res = await callAnthropicPdf({
      model,
      system: SYSTEM,
      user: "Extrais les champs de ce document d'identité (PDF recto/verso) selon le schéma JSON demandé.",
      pdfBase64: data64,
      expectsJson: true,
      maxTokens: 800,
    });
    return { ok: true, data: mapExtractionOutput(res.output), cost_usd: res.cost_usd };
  } catch (e) {
    return { ok: false, error: `Extraction impossible : ${(e as Error).message}` };
  }
}

/** Ramène un doc_type (canonique OU texte libre du modèle) vers l'enum attendu.
 *  Le modèle renvoie parfois « titre de séjour », « carte F », « verblijfstitel »… :
 *  on les rattache à titre_sejour au lieu de laisser le champ vide. */
function mapDocType(raw: unknown): ExtractedId["doc_type"] {
  const s = String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  if (!s || s === "null") return null;
  if (["ci_belge", "titre_sejour", "passeport", "autre"].includes(s)) {
    return s as ExtractedId["doc_type"];
  }
  // Ordre de priorité (attention : « carte d'identité » contient un « carte d » qui
  // ressemble à une carte de séjour type D -> l'identité passe AVANT le motif lettre).
  if (/passe?port/.test(s)) return "passeport";
  if (/vreemdeling|etranger|foreigner/.test(s)) return "titre_sejour"; // carte pour étrangers
  if (/identit|identiteit|\beid\b/.test(s)) return "ci_belge"; // carte d'identité belge / eID
  // Titre / carte de séjour (FR/NL/EN), cartes A/B/C/F/K/L, annexes, permis.
  if (
    /sejour|verblijf|titre|residence|resident|permit|permis|bijlage|annexe|\bkaart\b|\bcarte\s+[a-flk]\b/.test(
      s,
    )
  ) {
    return "titre_sejour";
  }
  if (/belg/.test(s)) return "ci_belge";
  return "autre";
}

/** Normalise la sortie brute du modèle en ExtractedId (commun images/PDF). */
function mapExtractionOutput(rawOutput: unknown): ExtractedId {
  const o = (rawOutput ?? {}) as Record<string, unknown>;
  return {
    doc_type: mapDocType(o.doc_type),
    first_name: strOrNull(o.first_name),
    last_name: strOrNull(o.last_name),
    full_name:
      strOrNull(o.full_name) ??
      ([strOrNull(o.first_name), strOrNull(o.last_name)].filter(Boolean).join(" ") || null),
    birth_date: isoOrNull(o.birth_date),
    sex: strOrNull(o.sex),
    birth_place: strOrNull(o.birth_place),
    nationality: strOrNull(o.nationality),
    nrn: strOrNull(o.nrn),
    doc_number: strOrNull(o.doc_number),
    expiry_date: isoOrNull(o.expiry_date),
    authorizes_work: typeof o.authorizes_work === "boolean" ? o.authorizes_work : null,
    confidence: typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0.5,
  };
}
