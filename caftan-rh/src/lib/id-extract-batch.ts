import "server-only";

// Karim 2026-07-11 : extraction IA en LOT des cartes d'identité DÉJÀ déposées
// (PDF recto/verso). On COMPLÈTE les champs manquants de la fiche et on SIGNALE
// les DISCORDANCES (valeur extraite ≠ valeur existante) — SANS jamais écraser une
// donnée existante (règle : signaler, ne pas adapter en silence).

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractIdDocumentFromPdf, type ExtractedId } from "@/lib/id-extraction";
import { computeWorkAuthorization } from "@/lib/work-authorization";

export type Discordance = {
  employeeId: string;
  name: string;
  field: string;
  existing: string;
  extracted: string;
};

export type ExtractBatchResult = {
  processed: number;
  filledWorkers: number; // fiches ayant reçu ≥1 champ complété
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

type EmpRow = {
  id: string;
  full_name: string | null;
  birth_date: string | null;
  nrn: string | null;
  nationality: string | null;
  residence_doc_type: string | null;
  residence_doc_expiry: string | null;
  residence_doc_number: string | null;
};

export async function extractAndUpdateAllIdCards(
  admin: SupabaseClient,
  opts?: { max?: number },
): Promise<ExtractBatchResult> {
  const max = opts?.max ?? 25;

  // Dernière CI (PDF) par employé.
  const { data: docsRaw } = await admin
    .from("documents")
    .select("employee_id, storage_path, created_at")
    .eq("kind", "id_card")
    .not("employee_id", "is", null)
    .order("created_at", { ascending: false });
  const latest = new Map<string, string>();
  for (const d of (docsRaw ?? []) as Array<{ employee_id: string; storage_path: string }>) {
    if (!latest.has(d.employee_id)) latest.set(d.employee_id, d.storage_path);
  }
  const targets = Array.from(latest.entries()).slice(0, max);
  if (targets.length === 0) {
    return { processed: 0, filledWorkers: 0, filledFields: 0, discordances: [], errors: [] };
  }

  const { data: empsRaw } = await admin
    .from("employees")
    .select("id, full_name, birth_date, nrn, nationality, residence_doc_type, residence_doc_expiry, residence_doc_number")
    .in("id", targets.map(([id]) => id));
  const byId = new Map<string, EmpRow>(((empsRaw ?? []) as EmpRow[]).map((e) => [e.id, e]));

  // Extraction EN PARALLÈLE (télécharge + Claude PDF) — tient dans le temps d'une
  // fonction serverless même à quelques dizaines de cartes.
  type ExItem = { empId: string; name: string; data: ExtractedId | null; error: string | null };
  const extracted: ExItem[] = await Promise.all(
    targets.map(async ([empId, path]): Promise<ExItem> => {
      const emp = byId.get(empId);
      const name = emp?.full_name ?? "?";
      try {
        const { data: blob, error } = await admin.storage.from("documents").download(path);
        if (error || !blob) return { empId, name, data: null, error: "PDF introuvable dans le stockage" };
        const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
        const ex = await extractIdDocumentFromPdf(b64);
        if (!ex.ok) return { empId, name, data: null, error: ex.error };
        return { empId, name, data: ex.data, error: null };
      } catch (e) {
        return { empId, name, data: null, error: (e as Error).message };
      }
    }),
  );

  const res: ExtractBatchResult = {
    processed: 0,
    filledWorkers: 0,
    filledFields: 0,
    discordances: [],
    errors: [],
  };

  for (const r of extracted) {
    if (r.error || !r.data) {
      res.errors.push({ name: r.name, error: r.error ?? "extraction vide" });
      continue;
    }
    const d = r.data;
    const emp = byId.get(r.empId);
    if (!emp) continue;
    res.processed += 1;

    const patch: Record<string, unknown> = {};
    // (field DB, valeur existante, valeur extraite, comparateur "identiques ?")
    const consider = (
      field: keyof EmpRow,
      existing: string | null,
      extractedVal: string | null,
      same: (a: string, b: string) => boolean,
    ) => {
      if (!extractedVal) return;
      if (!existing) {
        patch[field] = extractedVal; // COMPLÈTE un champ manquant
      } else if (!same(existing, extractedVal)) {
        res.discordances.push({
          employeeId: r.empId,
          name: r.name,
          field,
          existing: String(existing),
          extracted: String(extractedVal),
        });
      }
    };

    consider("full_name", emp.full_name, d.full_name, (a, b) => sameName(a, b));
    consider("birth_date", emp.birth_date, d.birth_date, (a, b) => iso10(a) === iso10(b));
    consider("nrn", emp.nrn, d.nrn, (a, b) => digits(a) === digits(b));
    consider("nationality", emp.nationality, d.nationality, (a, b) => norm(a) === norm(b));
    consider("residence_doc_type", emp.residence_doc_type, d.doc_type, (a, b) => norm(a) === norm(b));
    consider("residence_doc_expiry", emp.residence_doc_expiry, d.expiry_date, (a, b) => iso10(a) === iso10(b));
    consider("residence_doc_number", emp.residence_doc_number, d.doc_number, (a, b) => norm(a) === norm(b));

    const filledFields = Object.keys(patch).length;
    if (filledFields > 0) res.filledFields += filledFields;

    // Recalcule le droit au travail à partir des valeurs finales (existant + complété).
    const finalNat = (patch.nationality as string) ?? emp.nationality;
    if (finalNat) {
      const finalExpiry = (patch.residence_doc_expiry as string) ?? emp.residence_doc_expiry;
      const finalDocType = (patch.residence_doc_type as string) ?? emp.residence_doc_type;
      patch.work_authorization = computeWorkAuthorization({
        nationality: finalNat,
        expiry: finalExpiry,
        docType: finalDocType,
      }).status;
    }
    patch.id_extracted_at = new Date().toISOString();

    try {
      await admin.from("employees").update(patch).eq("id", r.empId);
      if (filledFields > 0) res.filledWorkers += 1;
    } catch (e) {
      res.errors.push({ name: r.name, error: `MAJ échouée : ${(e as Error).message}` });
    }
  }

  return res;
}

/** Corps texte du résultat batch (pour la notif admin). */
export function formatExtractBatchBody(r: ExtractBatchResult): string {
  const head =
    `Extraction des cartes déposées : ${r.processed} carte(s) lue(s) par l'IA. ` +
    `${r.filledWorkers} fiche(s) complétée(s) (${r.filledFields} champ(s)). ` +
    `${r.discordances.length} discordance(s). ${r.errors.length} erreur(s).`;
  const disc = r.discordances.length
    ? "\n\n⚠️ DISCORDANCES (fiche ≠ carte, NON modifié — à trancher) :\n" +
      r.discordances
        .map((d) => `• ${d.name} — ${d.field} : fiche « ${d.existing} » vs carte « ${d.extracted} »`)
        .join("\n")
    : "";
  const errs = r.errors.length
    ? "\n\nErreurs :\n" + r.errors.map((e) => `• ${e.name} : ${e.error}`).join("\n")
    : "";
  return head + disc + errs;
}
