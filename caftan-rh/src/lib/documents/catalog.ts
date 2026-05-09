// Wrappers typés autour de la table `document_catalog`.
// Source : `supabase/migrations/20260520000001_documents.sql`.

import { createClient } from "@/lib/supabase/server";

export type DocumentCategory = "admin" | "legal" | "bank" | "medical" | "other";
export type DocumentAppliesTo = "candidate" | "employee" | "both";
export type DocumentStage =
  | "sourcing"
  | "recruitment"
  | "hiring"
  | "onboarding"
  | "daily"
  | "offboarding";

export type CatalogItem = {
  slug: string;
  label: string;
  category: DocumentCategory;
  applies_to: DocumentAppliesTo;
  required_at_stage: DocumentStage | null;
  is_required: boolean;
  default_template_slug: string | null;
  description: string | null;
  position: number;
};

/** Liste complète du catalogue, ordonnée par position. */
export async function listCatalog(): Promise<CatalogItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_catalog")
    .select("slug, label, category, applies_to, required_at_stage, is_required, default_template_slug, description, position")
    .order("position", { ascending: true });
  return ((data ?? []) as unknown) as CatalogItem[];
}

/** Récupère un item du catalogue. */
export async function getCatalog(slug: string): Promise<CatalogItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_catalog")
    .select("slug, label, category, applies_to, required_at_stage, is_required, default_template_slug, description, position")
    .eq("slug", slug)
    .maybeSingle();
  return data ? ((data as unknown) as CatalogItem) : null;
}

/**
 * Items requis pour un stage donné, filtrables par cible.
 * `applies_to` accepte 'candidate' ou 'employee' ; les items 'both' sont toujours retournés.
 */
export async function requiredForStage(
  stage: DocumentStage,
  appliesTo: "candidate" | "employee",
): Promise<CatalogItem[]> {
  const items = await listCatalog();
  return items.filter(
    (it) =>
      it.is_required &&
      it.required_at_stage === stage &&
      (it.applies_to === appliesTo || it.applies_to === "both"),
  );
}
