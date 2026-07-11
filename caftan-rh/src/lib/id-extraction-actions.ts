"use server";

// Karim 2026-07-11 : contrôle intelligent CI / titre de séjour côté SELF-SERVICE
// (lien magique /contract-info). Le travailleur upload sa CI (recto/verso), l'IA
// extrait les champs :
//   1) champs D'IDENTITÉ -> renvoyés pour PRÉ-REMPLIR le formulaire (le travailleur
//      confirme / corrige via l'auto-save existant) ;
//   2) contrôle SYSTÈME (validité du document + droit au travail UE/hors-UE) ->
//      persisté et ESCALADE admin si vérification humaine requise.
// La décision finale (droit au travail, cas détachés Limosa/A1) reste HUMAINE.

import { createAdminClient } from "@/lib/supabase/server";
import { notifyRoles } from "@/lib/notify";
import { extractIdDocument, type ExtractedId } from "@/lib/id-extraction";
import { computeWorkAuthorization } from "@/lib/work-authorization";
import type { IdCardPayload } from "@/lib/id-card-actions";

export type WorkInfo = {
  status: string;
  needsAdmin: boolean;
  reason: string;
  daysToExpiry: number | null;
};

export type ExtractTokenResult =
  | { ok: true; data: ExtractedId; work: WorkInfo }
  | { ok: false; error: string };

export async function extractIdCardTokenAction(
  token: string,
  p: IdCardPayload,
): Promise<ExtractTokenResult> {
  const admin = createAdminClient();
  const { data: tok } = await admin
    .from("contract_info_tokens")
    .select("employee_id, candidate_id")
    .eq("token", token)
    .maybeSingle();
  if (!tok) return { ok: false, error: "Lien invalide ou expiré." };
  const t = tok as { employee_id: string | null; candidate_id: string | null };
  const table = t.candidate_id ? "candidates" : "employees";
  const rowId = t.candidate_id ?? t.employee_id;
  if (!rowId) return { ok: false, error: "Lien invalide." };

  // 1) Extraction IA (recto + verso).
  const images = [
    { base64: p.rectoB64, mime: p.rectoMime },
    { base64: p.versoB64, mime: p.versoMime },
  ].filter((i) => i.base64);
  const ex = await extractIdDocument(images);
  if (!ex.ok) return { ok: false, error: ex.error };
  const data = ex.data;

  // 2) Contrôle système : validité + droit au travail.
  const work = computeWorkAuthorization({
    nationality: data.nationality,
    docType: data.doc_type,
    expiry: data.expiry_date,
    authorizesWork: data.authorizes_work,
  });

  // Persiste le contrôle SYSTÈME (pas les champs identité — confirmés par le
  // travailleur). Ne remplit `nationality` que si vide (reste éditable).
  const { data: existing } = await admin
    .from(table)
    .select("nationality")
    .eq("id", rowId)
    .maybeSingle();
  const currentNat = (existing as { nationality?: string | null } | null)?.nationality ?? null;
  const patch: Record<string, unknown> = {
    residence_doc_type: data.doc_type,
    residence_doc_expiry: data.expiry_date,
    residence_doc_number: data.doc_number,
    work_authorization: work.status,
    id_extracted_at: new Date().toISOString(),
  };
  if (!currentNat && data.nationality) patch.nationality = data.nationality;
  try {
    await admin.from(table).update(patch).eq("id", rowId);
  } catch {
    /* best-effort : ne bloque pas le pré-remplissage */
  }

  // 3) Escalade admin si vérification humaine requise (hors-UE / titre à contrôler
  //    / document expiré). Notif objet précis + lien direct vers la fiche.
  if (work.needsAdmin) {
    const link = t.candidate_id
      ? `/rh/candidates/prevalidated/${t.candidate_id}`
      : `/planning/employees/${t.employee_id}`;
    const { data: who } = await admin
      .from(table)
      .select("full_name")
      .eq("id", rowId)
      .maybeSingle();
    const name = (who as { full_name?: string } | null)?.full_name ?? "un travailleur";
    try {
      await notifyRoles(["admin", "rh"], {
        kind: "work_authorization",
        title: `Droit au travail à vérifier — ${name}`,
        body: `${work.reason}\nDocument : ${data.doc_type ?? "?"} · validité : ${data.expiry_date ?? "?"} · nationalité : ${data.nationality ?? "?"}.`,
        link,
        data: { work, doc_type: data.doc_type, expiry: data.expiry_date, nationality: data.nationality },
      });
    } catch {
      /* non bloquant */
    }
  }

  return { ok: true, data, work };
}
