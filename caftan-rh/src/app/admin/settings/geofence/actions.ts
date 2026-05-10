"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

const MIN_RADIUS = 25;
const MAX_RADIUS = 5000;

function clampRadius(
  v: FormDataEntryValue | string | number | null,
  fallback: number,
): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, Math.round(n)));
}

/**
 * Met à jour le rayon par défaut + le toggle strict global.
 * `default_radius_m` est appliqué à TOUS les sites qui ont actuellement le
 * même rayon que l'ancien défaut (pour ne pas écraser les overrides explicites).
 */
export async function updateGeofenceSettingsAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const radius = clampRadius(formData.get("default_radius_m"), 100);
  const strict = formData.get("clock_geofence_strict") === "on";

  const { error } = await supabase
    .from("org_settings")
    .update({ clock_geofence_strict: strict })
    .eq("id", 1);
  if (error) return { error: error.message };

  // Le rayon "par défaut" ne se stocke pas en org_settings (il vit dans la
  // colonne sites.geofence_radius_m côté DB). On l'applique aux sites qui
  // n'ont PAS d'override (= ceux à NULL).
  const { error: e2 } = await supabase
    .from("sites")
    .update({ geofence_radius_m: radius })
    .is("geofence_radius_m", null);
  if (e2) return { error: e2.message };

  revalidatePath("/admin/settings/geofence");
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Met à jour le rayon d'UN site précis. */
export async function updateSiteGeofenceAction(
  siteId: string,
  radius: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!siteId || typeof siteId !== "string") {
    return { error: "site_id manquant." };
  }
  const r = clampRadius(radius, 100);
  const supabase = await createClient();
  const { error } = await supabase
    .from("sites")
    .update({ geofence_radius_m: r })
    .eq("id", siteId);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings/geofence");
  return { ok: true };
}
