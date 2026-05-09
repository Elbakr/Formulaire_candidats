// Calcul des documents manquants pour un candidat ou un employé.
// Logique : on prend tous les items du catalogue applicables à l'entité
// (selon son statut), puis on regarde quelles `documents` rows existent
// pour ce slug avec `validation_status='accepted'`.

import { createAdminClient } from "@/lib/supabase/server";
import { listCatalog, type CatalogItem, type DocumentStage } from "@/lib/documents/catalog";

export type MissingDoc = {
  slug: string;
  label: string;
  category: CatalogItem["category"];
  description: string | null;
  position: number;
  required_at_stage: DocumentStage | null;
  hasFile: boolean;
  validation_status?: "pending" | "accepted" | "rejected" | null;
  has_pending_token?: boolean;
};

type Args = {
  candidateId?: string;
  employeeId?: string;
  applicationId?: string;
};

const STAGE_ORDER: DocumentStage[] = [
  "sourcing",
  "recruitment",
  "hiring",
  "onboarding",
  "daily",
  "offboarding",
];

/**
 * Détermine quels stages sont applicables selon le statut de la candidature.
 * - 'new' / 'contacted'        : sourcing
 * - 'rdv_scheduled'/'rdv_done' : sourcing + recruitment
 * - 'wait_decision'            : sourcing + recruitment
 * - 'hired'                    : sourcing + recruitment + hiring (+ onboarding une fois employé)
 */
function stagesForApplicationStatus(status: string | null | undefined): DocumentStage[] {
  switch (status) {
    case "new":
    case "contacted":
      return ["sourcing"];
    case "rdv_scheduled":
    case "rdv_done":
    case "wait_decision":
      return ["sourcing", "recruitment"];
    case "hired":
      return ["sourcing", "recruitment", "hiring"];
    default:
      return ["sourcing"];
  }
}

/**
 * Calcule la liste des documents pertinents pour le dossier (présents + manquants).
 * Retourne aussi pour chaque slug : un fichier déjà uploadé ? sa validation ? un token actif ?
 */
export async function computeMissingDocs(args: Args): Promise<MissingDoc[]> {
  if (!args.candidateId && !args.employeeId && !args.applicationId) return [];

  const admin = createAdminClient();

  // ── 1. Détermine la cible (candidate / employee) et le stage applicable
  let candidateId = args.candidateId ?? null;
  let employeeId = args.employeeId ?? null;
  let applicationStatus: string | null = null;
  let isEmployee = !!employeeId;

  if (args.applicationId) {
    const { data: app } = await admin
      .from("applications")
      .select("id, status, candidate_id")
      .eq("id", args.applicationId)
      .maybeSingle();
    const a = app as unknown as { id: string; status: string; candidate_id: string } | null;
    if (a) {
      applicationStatus = a.status;
      if (!candidateId) candidateId = a.candidate_id;
      // Si embauché → cherche aussi l'employé associé pour les docs onboarding
      if (a.status === "hired") {
        const { data: emp } = await admin
          .from("employees")
          .select("id")
          .eq("application_id", a.id)
          .maybeSingle();
        const e = emp as unknown as { id: string } | null;
        if (e) {
          employeeId = e.id;
          isEmployee = true;
        }
      }
    }
  } else if (candidateId && !employeeId) {
    // Cherche la candidature la plus récente du candidat pour déduire le stage
    const { data: app } = await admin
      .from("applications")
      .select("id, status")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const a = app as unknown as { id: string; status: string } | null;
    if (a) applicationStatus = a.status;
  }

  // Si on a un employee, il faut aussi inclure les docs hiring + onboarding
  const stages = isEmployee
    ? (["sourcing", "recruitment", "hiring", "onboarding"] as DocumentStage[])
    : stagesForApplicationStatus(applicationStatus);

  // ── 2. Récupère le catalogue applicable
  const catalog = await listCatalog();
  const targetTypes: ("candidate" | "employee" | "both")[] = isEmployee
    ? ["employee", "both"]
    : ["candidate", "both"];
  const applicable = catalog.filter(
    (it) =>
      it.is_required &&
      it.required_at_stage !== null &&
      stages.includes(it.required_at_stage as DocumentStage) &&
      targetTypes.includes(it.applies_to),
  );

  // ── 3. Cross-référence avec les documents existants
  const docFilters: string[] = [];
  if (candidateId) docFilters.push(`candidate_id.eq.${candidateId}`);
  if (employeeId) docFilters.push(`employee_id.eq.${employeeId}`);
  if (args.applicationId) docFilters.push(`application_id.eq.${args.applicationId}`);

  let documents: Array<{ catalog_slug: string | null; validation_status: string | null }> = [];
  if (docFilters.length > 0) {
    const { data } = await admin
      .from("documents")
      .select("catalog_slug, validation_status")
      .or(docFilters.join(","));
    documents = (data ?? []) as unknown as typeof documents;
  }

  // ── 4. Tokens actifs pour cette cible
  const tokenFilters: string[] = [];
  if (candidateId) tokenFilters.push(`candidate_id.eq.${candidateId}`);
  if (employeeId) tokenFilters.push(`employee_id.eq.${employeeId}`);
  if (args.applicationId) tokenFilters.push(`application_id.eq.${args.applicationId}`);
  let activeTokens: Array<{ doc_slug: string | null }> = [];
  if (tokenFilters.length > 0) {
    const { data } = await admin
      .from("document_upload_tokens")
      .select("doc_slug")
      .eq("status", "active")
      .or(tokenFilters.join(","))
      .gt("expires_at", new Date().toISOString());
    activeTokens = (data ?? []) as unknown as typeof activeTokens;
  }
  const activeTokenSlugs = new Set(activeTokens.map((t) => t.doc_slug).filter(Boolean) as string[]);

  // ── 5. Construit la sortie
  const result: MissingDoc[] = applicable.map((it) => {
    const matching = documents.filter((d) => d.catalog_slug === it.slug);
    const accepted = matching.find((d) => d.validation_status === "accepted");
    const pending = matching.find((d) => d.validation_status === "pending");
    const rejected = matching.find((d) => d.validation_status === "rejected");
    const status =
      (accepted ? "accepted" : pending ? "pending" : rejected ? "rejected" : null) as
        | "accepted"
        | "pending"
        | "rejected"
        | null;
    return {
      slug: it.slug,
      label: it.label,
      category: it.category,
      description: it.description,
      position: it.position,
      required_at_stage: it.required_at_stage,
      hasFile: matching.length > 0,
      validation_status: status,
      has_pending_token: activeTokenSlugs.has(it.slug),
    };
  });

  // Garde le tri par stage puis position
  result.sort((a, b) => {
    const sa = a.required_at_stage ? STAGE_ORDER.indexOf(a.required_at_stage) : 99;
    const sb = b.required_at_stage ? STAGE_ORDER.indexOf(b.required_at_stage) : 99;
    if (sa !== sb) return sa - sb;
    return a.position - b.position;
  });
  return result;
}
