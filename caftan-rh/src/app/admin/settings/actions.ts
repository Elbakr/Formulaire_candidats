"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function saveSettingsAction(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const payload = {
    org_name: String(formData.get("org_name") ?? "CaftanRH").trim(),
    email_signature: String(formData.get("email_signature") ?? ""),
    timezone: String(formData.get("timezone") ?? "Europe/Brussels"),
    default_language: String(formData.get("default_language") ?? "fr-BE"),
    logo_url: String(formData.get("logo_url") ?? "").trim() || null,
  };
  const { error } = await supabase.from("org_settings").update(payload).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}
