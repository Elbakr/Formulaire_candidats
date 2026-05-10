"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { DEFAULT_KPI_WEIGHTS, type KpiWeights } from "./types";

function clampInt(v: FormDataEntryValue | null, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function updateKpiWeightsAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin"]);
  const weights: KpiWeights = {
    ponctualite: clampInt(formData.get("ponctualite"), DEFAULT_KPI_WEIGHTS.ponctualite),
    fiabilite: clampInt(formData.get("fiabilite"), DEFAULT_KPI_WEIGHTS.fiabilite),
    heures_vs_prevu: clampInt(formData.get("heures_vs_prevu"), DEFAULT_KPI_WEIGHTS.heures_vs_prevu),
    absences: clampInt(formData.get("absences"), DEFAULT_KPI_WEIGHTS.absences),
    rating_hebdo: clampInt(formData.get("rating_hebdo"), DEFAULT_KPI_WEIGHTS.rating_hebdo),
    ventes: clampInt(formData.get("ventes"), DEFAULT_KPI_WEIGHTS.ventes),
  };
  const total =
    weights.ponctualite +
    weights.fiabilite +
    weights.heures_vs_prevu +
    weights.absences +
    weights.rating_hebdo +
    weights.ventes;
  if (total !== 100) {
    return { error: `Le total doit faire 100 (actuel : ${total}).` };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_settings")
    .update({ kpi_weights: weights })
    .eq("id", 1);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings/kpi-weights");
  revalidatePath("/admin/settings");
  return { ok: true };
}
