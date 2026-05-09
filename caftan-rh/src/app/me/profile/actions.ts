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
