"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export async function updateProfileAction(formData: FormData) {
  const { user } = await requireProfile();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (!fullName) return { error: "Nom requis." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/me", "layout");
  return { ok: true };
}

/**
 * Karim 2026-06-18 : AUTO-SAVE par champ (sans soumettre). Le nom requis n'est
 * jamais vidé par du vide.
 */
export async function autosaveProfileAction(
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const patch: Record<string, string | null> = {};
  if ("full_name" in values) {
    const v = (values.full_name ?? "").trim();
    if (v) patch.full_name = v; // jamais vidé (champ requis)
  }
  if ("phone" in values) patch.phone = (values.phone ?? "").trim() || null;
  if (Object.keys(patch).length === 0) return { ok: true };
  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me", "layout");
  return { ok: true };
}
