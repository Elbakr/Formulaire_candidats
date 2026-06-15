"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { DEFAULT_ACQUISITION_CONFIG, type AcquisitionConfig } from "./types";

function clampInt(
  v: FormDataEntryValue | null,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function updateAcquisitionConfigAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin"]);

  const config: AcquisitionConfig = {
    min_score_to_hire: clampInt(
      formData.get("min_score_to_hire"),
      0,
      100,
      DEFAULT_ACQUISITION_CONFIG.min_score_to_hire,
    ),
    pre_interview_relance_days: clampInt(
      formData.get("pre_interview_relance_days"),
      1,
      30,
      DEFAULT_ACQUISITION_CONFIG.pre_interview_relance_days,
    ),
    interview_planning_window_days: clampInt(
      formData.get("interview_planning_window_days"),
      1,
      90,
      DEFAULT_ACQUISITION_CONFIG.interview_planning_window_days,
    ),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_settings")
    .update({ acquisition_config: config })
    .eq("id", 1);

  if (error) return { error: error.message };

  revalidatePath("/admin/settings/acquisition");
  revalidatePath("/admin/settings");
  return { ok: true };
}
