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
    prayer_pause_enabled: formData.get("prayer_pause_enabled") === "on",
    prayer_pause_summer: String(formData.get("prayer_pause_summer") ?? "13:55-14:45").trim(),
    prayer_pause_winter: String(formData.get("prayer_pause_winter") ?? "12:55-13:45").trim(),
    prayer_pause_dst_start: String(formData.get("prayer_pause_dst_start") ?? "04-01").trim(),
    prayer_pause_dst_end: String(formData.get("prayer_pause_dst_end") ?? "10-01").trim(),
  };
  const { error } = await supabase.from("org_settings").update(payload).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}
