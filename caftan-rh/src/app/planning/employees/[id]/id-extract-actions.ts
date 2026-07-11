"use server";

// Karim 2026-07-11 : bouton fiche « Extraire & vérifier (IA) ». Rétro-actif, au cas
// par cas : lit la carte d'identité déposée (PDF/image), COMPLÈTE les champs manquants
// de la fiche, SIGNALE les discordances (jamais d'écrasement), et contrôle la
// CONFORMITÉ/validité de TOUS les documents du travailleur (CI, Limosa, A1…).

import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { extractAndUpdateOneIdCard, frFieldLabel } from "@/lib/id-extract-batch";
import { checkDocumentConformity } from "@/lib/document-conformity";
import { revalidatePath } from "next/cache";

export type ExtractEmployeeIdResult = {
  extractOk: boolean;
  extractError?: string;
  filled: string[]; // libellés FR des champs complétés
  discordances: Array<{ field: string; existing: string; extracted: string }>;
  workAuthorization?: string | null;
  docsChecked: number;
  docsConform: number;
  docsIssues: number;
};

export async function extractEmployeeIdAction(employeeId: string): Promise<ExtractEmployeeIdResult> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  // 1. Extraction + application (carte d'identité).
  const ex = await extractAndUpdateOneIdCard(admin, employeeId);

  // 2. Conformité/validité de TOUS les documents du travailleur (best-effort).
  const { data: docsRaw } = await admin
    .from("documents")
    .select("id, storage_path, mime_type")
    .eq("employee_id", employeeId)
    .not("storage_path", "is", null)
    .not("storage_path", "ilike", "http%");
  const docs = (docsRaw ?? []) as Array<{ id: string; storage_path: string; mime_type: string | null }>;

  let docsChecked = 0;
  let docsConform = 0;
  let docsIssues = 0;
  for (const doc of docs) {
    try {
      const r = await checkDocumentConformity(admin, doc);
      if (r.ok) {
        docsChecked += 1;
        if (r.result?.status === "conforme") docsConform += 1;
        else docsIssues += 1;
      }
    } catch {
      /* non bloquant */
    }
  }

  revalidatePath(`/planning/employees/${employeeId}`);

  return {
    extractOk: ex.ok,
    extractError: ex.error,
    filled: ex.filled.map(frFieldLabel),
    discordances: ex.discordances.map((d) => ({
      field: frFieldLabel(d.field),
      existing: d.existing,
      extracted: d.extracted,
    })),
    workAuthorization: ex.workAuthorization,
    docsChecked,
    docsConform,
    docsIssues,
  };
}
