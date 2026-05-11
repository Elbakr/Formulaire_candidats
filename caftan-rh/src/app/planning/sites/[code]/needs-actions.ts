"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

type NeedInput = {
  siteId: string;
  day_of_week: number; // 0..6 (0=Dim..6=Sam)
  start_time: string;  // "HH:MM"
  end_time: string;
  headcount: number;
  role: string | null;
  is_friday_morning?: boolean;
  is_friday_afternoon?: boolean;
};

function validateInput(input: Omit<NeedInput, "siteId">): string | null {
  if (!Number.isInteger(input.day_of_week) || input.day_of_week < 0 || input.day_of_week > 6) {
    return "Jour de la semaine invalide.";
  }
  if (!input.start_time || !input.end_time) return "Horaires requis.";
  if (input.start_time >= input.end_time) return "L'heure de fin doit être après l'heure de début.";
  if (!Number.isFinite(input.headcount) || input.headcount < 1) return "Effectif requis (≥ 1).";
  return null;
}

export async function addSiteNeedAction(input: NeedInput) {
  await requireRole(["admin", "rh"]);
  const err = validateInput(input);
  if (err) return { error: err };
  const supabase = await createClient();
  const { error } = await supabase.from("site_needs").insert({
    site_id: input.siteId,
    day_of_week: input.day_of_week,
    start_time: input.start_time,
    end_time: input.end_time,
    headcount: input.headcount,
    role: input.role,
    is_friday_morning: input.day_of_week === 5 ? !!input.is_friday_morning : false,
    is_friday_afternoon: input.day_of_week === 5 ? !!input.is_friday_afternoon : false,
  });
  if (error) return { error: error.message };
  revalidatePath("/planning/sites", "layout");
  return { ok: true };
}

export async function updateSiteNeedAction(input: NeedInput & { id: string }) {
  await requireRole(["admin", "rh"]);
  const err = validateInput(input);
  if (err) return { error: err };
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_needs")
    .update({
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      headcount: input.headcount,
      role: input.role,
      is_friday_morning: input.day_of_week === 5 ? !!input.is_friday_morning : false,
      is_friday_afternoon: input.day_of_week === 5 ? !!input.is_friday_afternoon : false,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/sites", "layout");
  return { ok: true };
}

export async function deleteSiteNeedAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("site_needs").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/planning/sites", "layout");
  return { ok: true };
}

/**
 * Eteint/rallume un creneau sans le supprimer. Le solver ignore les creneaux
 * is_enabled=false. Permet au RH de desactiver un besoin ponctuellement (par
 * ex. fermeture exceptionnelle d'une apres-midi) sans devoir le recreer.
 */
export async function toggleSiteNeedAction(id: string, enabled: boolean) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_needs")
    .update({ is_enabled: enabled })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/planning/sites", "layout");
  return { ok: true };
}
