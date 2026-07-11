import "server-only";

// Karim 2026-07-11 : extraction IA en LOT des cartes d'identité DÉJÀ déposées
// (PDF recto/verso) — employés COURANTS ET candidats PRÉ-VALIDÉS. On COMPLÈTE les
// champs manquants de la fiche et on SIGNALE les DISCORDANCES (valeur extraite ≠
// existante) — SANS jamais écraser une donnée existante (règle : signaler, ne pas
// adapter en silence).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractIdDocumentFromPdf,
  extractIdDocument,
  type ExtractedId,
  type ExtractResult,
} from "@/lib/id-extraction";
import { computeWorkAuthorization } from "@/lib/work-authorization";

type SubjectKind = "employee" | "candidate";

export type Discordance = {
  subjectId: string;
  kind: SubjectKind;
  name: string;
  field: string;
  existing: string;
  extracted: string;
};

export type ExtractBatchResult = {
  processed: number;
  filledSubjects: number; // fiches ayant reçu ≥1 champ complété
  filledFields: number; // total de champs complétés
  discordances: Discordance[];
  errors: Array<{ name: string; error: string }>;
};

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}
/** Même personne ? compare l'ENSEMBLE de tokens (ordre nom/prénom indifférent). */
function sameName(a: string | null, b: string | null): boolean {
  const ta = new Set(norm(a).split(" ").filter(Boolean));
  const tb = new Set(norm(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return true;
  for (const t of tb) if (!ta.has(t)) return false;
  for (const t of ta) if (!tb.has(t)) return false;
  return true;
}
const iso10 = (v: unknown): string => String(v ?? "").slice(0, 10);

type SubjectRow = {
  id: string;
  full_name: string | null;
  birth_date: string | null;
  nrn: string | null;
  nationality: string | null;
  residence_doc_type: string | null;
  residence_doc_expiry: string | null;
  residence_doc_number: string | null;
};
type Subject = { kind: SubjectKind; table: "employees" | "candidates"; storagePath: string; row: SubjectRow };

const SELECT =
  "id, full_name, birth_date, nrn, nationality, residence_doc_type, residence_doc_expiry, residence_doc_number";

async function gatherSubjects(admin: SupabaseClient, kind: SubjectKind): Promise<Subject[]> {
  const table = kind === "employee" ? "employees" : "candidates";
  const idCol = kind === "employee" ? "employee_id" : "candidate_id";

  const { data: docsRaw } = await admin
    .from("documents")
    .select(`${idCol}, storage_path, created_at`)
    .eq("kind", "id_card")
    .not(idCol, "is", null)
    .order("created_at", { ascending: false });
  const latest = new Map<string, string>();
  for (const d of (docsRaw ?? []) as Array<Record<string, string | null>>) {
    const id = d[idCol];
    if (id && !latest.has(id)) latest.set(id, d.storage_path as string);
  }
  if (latest.size === 0) return [];

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  let rows: SubjectRow[] = [];
  if (kind === "employee") {
    const { data } = await admin
      .from("employees")
      .select(`${SELECT}, end_date`)
      .in("id", [...latest.keys()]);
    rows = ((data ?? []) as Array<SubjectRow & { end_date: string | null }>)
      .filter((e) => !e.end_date || e.end_date >= today)
      .map(({ end_date, ...r }) => r); // eslint-disable-line @typescript-eslint/no-unused-vars
  } else {
    const { data } = await admin
      .from("candidates")
      .select(`${SELECT}, prevalidated`)
      .in("id", [...latest.keys()]);
    rows = ((data ?? []) as Array<SubjectRow & { prevalidated: boolean | null }>)
      .filter((e) => e.prevalidated === true)
      .map(({ prevalidated, ...r }) => r); // eslint-disable-line @typescript-eslint/no-unused-vars
  }

  return rows
    .map((row) => ({ kind, table: table as Subject["table"], storagePath: latest.get(row.id)!, row }))
    .filter((s) => !!s.storagePath);
}

export async function extractAndUpdateAllIdCards(
  admin: SupabaseClient,
  opts?: { max?: number },
): Promise<ExtractBatchResult> {
  const max = opts?.max ?? 30;

  const subjects = [
    ...(await gatherSubjects(admin, "employee")),
    ...(await gatherSubjects(admin, "candidate")),
  ].slice(0, max);

  const res: ExtractBatchResult = {
    processed: 0,
    filledSubjects: 0,
    filledFields: 0,
    discordances: [],
    errors: [],
  };
  if (subjects.length === 0) return res;

  // Extraction EN PARALLÈLE (télécharge + Claude PDF).
  type ExItem = { s: Subject; data: ExtractedId | null; error: string | null };
  const extracted: ExItem[] = await Promise.all(
    subjects.map(async (s): Promise<ExItem> => {
      const name = s.row.full_name ?? "?";
      try {
        const { data: blob, error } = await admin.storage.from("documents").download(s.storagePath);
        if (error || !blob) return { s, data: null, error: `${name} : PDF introuvable dans le stockage` };
        const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
        const ex = await extractIdDocumentFromPdf(b64);
        if (!ex.ok) return { s, data: null, error: `${name} : ${ex.error}` };
        return { s, data: ex.data, error: null };
      } catch (e) {
        return { s, data: null, error: `${name} : ${(e as Error).message}` };
      }
    }),
  );

  for (const it of extracted) {
    if (it.error || !it.data) {
      res.errors.push({ name: it.s.row.full_name ?? "?", error: it.error ?? "extraction vide" });
      continue;
    }
    const d = it.data;
    const { kind, table, row } = it.s;
    res.processed += 1;

    const patch: Record<string, unknown> = {};
    const consider = (
      field: keyof SubjectRow,
      existing: string | null,
      extractedVal: string | null,
      same: (a: string, b: string) => boolean,
    ) => {
      if (!extractedVal) return;
      if (!existing) {
        patch[field] = extractedVal; // COMPLÈTE un champ manquant
      } else if (!same(existing, extractedVal)) {
        res.discordances.push({
          subjectId: row.id,
          kind,
          name: row.full_name ?? "?",
          field,
          existing: String(existing),
          extracted: String(extractedVal),
        });
      }
    };

    consider("full_name", row.full_name, d.full_name, (a, b) => sameName(a, b));
    consider("birth_date", row.birth_date, d.birth_date, (a, b) => iso10(a) === iso10(b));
    consider("nrn", row.nrn, d.nrn, (a, b) => digits(a) === digits(b));
    consider("nationality", row.nationality, d.nationality, (a, b) => norm(a) === norm(b));
    consider("residence_doc_type", row.residence_doc_type, d.doc_type, (a, b) => norm(a) === norm(b));
    consider("residence_doc_expiry", row.residence_doc_expiry, d.expiry_date, (a, b) => iso10(a) === iso10(b));
    consider("residence_doc_number", row.residence_doc_number, d.doc_number, (a, b) => norm(a) === norm(b));

    const filledFields = Object.keys(patch).length;
    if (filledFields > 0) res.filledFields += filledFields;

    const finalNat = (patch.nationality as string) ?? row.nationality;
    if (finalNat) {
      patch.work_authorization = computeWorkAuthorization({
        nationality: finalNat,
        expiry: (patch.residence_doc_expiry as string) ?? row.residence_doc_expiry,
        docType: (patch.residence_doc_type as string) ?? row.residence_doc_type,
      }).status;
    }
    patch.id_extracted_at = new Date().toISOString();

    try {
      await admin.from(table).update(patch).eq("id", row.id);
      if (filledFields > 0) res.filledSubjects += 1;
    } catch (e) {
      res.errors.push({ name: row.full_name ?? "?", error: `MAJ échouée : ${(e as Error).message}` });
    }
  }

  return res;
}

// ── Extraction PAR FICHE (un seul travailleur, à la demande admin) ───────────
// Karim 2026-07-11 : bouton fiche « Extraire (IA) ». Lit la DERNIÈRE carte d'identité
// (PDF ou image) du travailleur, COMPLÈTE les champs manquants et SIGNALE les
// discordances — jamais d'écrasement silencieux. Rétro-actif : marche pour tous les
// travailleurs existants ayant déjà déposé une CI.
export type ExtractOneResult = {
  ok: boolean;
  error?: string;
  filledFields: number;
  filled: string[]; // champs complétés (clés)
  discordances: Discordance[];
  workAuthorization?: string | null;
};

const FIELD_LABEL: Record<string, string> = {
  full_name: "nom complet",
  birth_date: "date de naissance",
  nrn: "n° registre national",
  nationality: "nationalité",
  residence_doc_type: "type de titre de séjour",
  residence_doc_expiry: "date d'expiration du titre",
  residence_doc_number: "n° du titre de séjour",
};
export function frFieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key;
}

export async function extractAndUpdateOneIdCard(
  admin: SupabaseClient,
  employeeId: string,
): Promise<ExtractOneResult> {
  const empty = (error: string): ExtractOneResult => ({
    ok: false,
    error,
    filledFields: 0,
    filled: [],
    discordances: [],
  });

  // 1. Dernière carte d'identité déposée.
  const { data: docsRaw } = await admin
    .from("documents")
    .select("storage_path, mime_type, created_at")
    .eq("kind", "id_card")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(1);
  const doc = (docsRaw ?? [])[0] as { storage_path: string; mime_type: string | null } | undefined;
  if (!doc?.storage_path) return empty("Aucune carte d'identité déposée pour ce travailleur.");

  // 2. Fiche.
  const { data: empRaw } = await admin.from("employees").select(SELECT).eq("id", employeeId).maybeSingle();
  const row = empRaw as SubjectRow | null;
  if (!row) return empty("Travailleur introuvable.");

  // 3. Extraction (PDF ou image).
  let ex: ExtractResult;
  try {
    const { data: blob, error } = await admin.storage.from("documents").download(doc.storage_path);
    if (error || !blob) return empty("Carte d'identité introuvable dans le stockage.");
    const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const isPdf = /pdf/i.test(doc.mime_type ?? "") || doc.storage_path.toLowerCase().endsWith(".pdf");
    ex = isPdf
      ? await extractIdDocumentFromPdf(b64)
      : await extractIdDocument([{ base64: b64, mime: doc.mime_type ?? "image/jpeg" }]);
  } catch (e) {
    return empty((e as Error).message);
  }
  if (!ex.ok) return empty(ex.error);
  const d = ex.data;

  // 4. Complète / signale (même logique que le batch).
  const discordances: Discordance[] = [];
  const patch: Record<string, unknown> = {};
  const filled: string[] = [];
  const consider = (
    field: keyof SubjectRow,
    existing: string | null,
    extractedVal: string | null,
    same: (a: string, b: string) => boolean,
  ) => {
    if (!extractedVal) return;
    if (!existing) {
      patch[field] = extractedVal;
      filled.push(field as string);
    } else if (!same(existing, extractedVal)) {
      discordances.push({
        subjectId: row.id,
        kind: "employee",
        name: row.full_name ?? "?",
        field: field as string,
        existing: String(existing),
        extracted: String(extractedVal),
      });
    }
  };
  consider("full_name", row.full_name, d.full_name, (a, b) => sameName(a, b));
  consider("birth_date", row.birth_date, d.birth_date, (a, b) => iso10(a) === iso10(b));
  consider("nrn", row.nrn, d.nrn, (a, b) => digits(a) === digits(b));
  consider("nationality", row.nationality, d.nationality, (a, b) => norm(a) === norm(b));
  consider("residence_doc_type", row.residence_doc_type, d.doc_type, (a, b) => norm(a) === norm(b));
  consider("residence_doc_expiry", row.residence_doc_expiry, d.expiry_date, (a, b) => iso10(a) === iso10(b));
  consider("residence_doc_number", row.residence_doc_number, d.doc_number, (a, b) => norm(a) === norm(b));

  const finalNat = (patch.nationality as string) ?? row.nationality;
  let workAuthorization: string | null = null;
  if (finalNat) {
    workAuthorization = computeWorkAuthorization({
      nationality: finalNat,
      expiry: (patch.residence_doc_expiry as string) ?? row.residence_doc_expiry,
      docType: (patch.residence_doc_type as string) ?? row.residence_doc_type,
    }).status;
    patch.work_authorization = workAuthorization;
  }
  patch.id_extracted_at = new Date().toISOString();

  try {
    await admin.from("employees").update(patch).eq("id", row.id);
  } catch (e) {
    return empty(`Mise à jour de la fiche échouée : ${(e as Error).message}`);
  }

  return { ok: true, filledFields: filled.length, filled, discordances, workAuthorization };
}

/** Corps texte du résultat batch (pour la notif admin). */
export function formatExtractBatchBody(r: ExtractBatchResult): string {
  const head =
    `Extraction des cartes déposées (employés + candidats pré-validés) : ${r.processed} carte(s) lue(s) par l'IA. ` +
    `${r.filledSubjects} fiche(s) complétée(s) (${r.filledFields} champ(s)). ` +
    `${r.discordances.length} discordance(s). ${r.errors.length} erreur(s).`;
  const disc = r.discordances.length
    ? "\n\n⚠️ DISCORDANCES (fiche ≠ carte, NON modifié — à trancher) :\n" +
      r.discordances
        .map(
          (d) =>
            `• ${d.name}${d.kind === "candidate" ? " (candidat)" : ""} — ${d.field} : fiche « ${d.existing} » vs carte « ${d.extracted} »`,
        )
        .join("\n")
    : "";
  const errs = r.errors.length
    ? "\n\nErreurs :\n" + r.errors.map((e) => `• ${e.error}`).join("\n")
    : "";
  return head + disc + errs;
}
