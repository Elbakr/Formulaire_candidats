"use server";

// Karim 2026-07-07 : CRUD du RÉFÉRENTIEL « conduite & erreurs de débutant » pour
// les nouvelles recrues. Catalogue admin curable (ajout/modif/suppr/toggle).
// PAS d'envoi automatique — usage interne, servira plus tard à l'onboarding.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const SEVERITIES = ["info", "important", "critique"] as const;
type Severity = (typeof SEVERITIES)[number];

export type ConductInput = {
  id?: string;
  category: string;
  category_nl: string | null;
  title: string;
  title_nl: string | null;
  description: string | null;
  description_nl: string | null;
  phase: string | null;
  phase_nl: string | null;
  severity: string;
  sort_order: number;
  is_active: boolean;
};

export async function upsertConductItemAction(
  input: ConductInput,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const category = input.category?.trim();
  const title = input.title?.trim();
  if (!category) return { ok: false, error: "La catégorie est requise." };
  if (!title) return { ok: false, error: "L'intitulé est requis." };
  const severity: Severity = SEVERITIES.includes(input.severity as Severity)
    ? (input.severity as Severity)
    : "important";

  const row = {
    category,
    category_nl: input.category_nl?.trim() || null,
    title,
    title_nl: input.title_nl?.trim() || null,
    description: input.description?.trim() || null,
    description_nl: input.description_nl?.trim() || null,
    phase: input.phase?.trim() || null,
    phase_nl: input.phase_nl?.trim() || null,
    severity,
    sort_order: Number.isFinite(input.sort_order) ? Math.trunc(input.sort_order) : 0,
    is_active: !!input.is_active,
    updated_at: new Date().toISOString(),
  };

  const { error } = input.id
    ? await admin.from("recruit_conduct_items").update(row).eq("id", input.id)
    : await admin.from("recruit_conduct_items").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/recruit-conduct");
  return { ok: true };
}

export async function deleteConductItemAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!id) return { ok: false, error: "Identifiant manquant." };
  const admin = createAdminClient();
  const { error } = await admin.from("recruit_conduct_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/recruit-conduct");
  return { ok: true };
}

export async function toggleConductItemAction(
  id: string,
  is_active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!id) return { ok: false, error: "Identifiant manquant." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("recruit_conduct_items")
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/recruit-conduct");
  return { ok: true };
}
