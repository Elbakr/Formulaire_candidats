"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { syncGravityForms, type GFFieldMap, type GFSettings, type SyncStats } from "@/lib/gravity-forms";

export async function saveGfSettingsAction(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const wp_url = String(formData.get("wp_url") ?? "").trim();
  const ck = String(formData.get("ck") ?? "").trim();
  const cs = String(formData.get("cs") ?? "").trim();
  const form_id = Number(formData.get("form_id") ?? 4);
  const enabled = formData.get("enabled") === "on";

  const field_map: GFFieldMap = {};
  const keys: (keyof GFFieldMap)[] = [
    "firstname", "lastname", "birthdate", "email", "phone",
    "cv_url", "available_from", "worktime", "role", "city", "days_prefix",
  ];
  for (const k of keys) {
    const v = String(formData.get(`field_${k}`) ?? "").trim();
    if (v) field_map[k] = v;
  }

  const { error } = await supabase
    .from("gf_settings")
    .update({ wp_url, ck, cs, form_id, field_map, enabled })
    .eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/admin/integrations/gravity-forms");
  return { ok: true };
}

export async function runGfSyncAction(): Promise<{ error?: string; stats?: SyncStats }> {
  // Karim 15/05 : RH peut declencher la sync depuis /rh/candidates aussi,
  // pas uniquement les admin via /admin/integrations/gravity-forms.
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { data } = await supabase.from("gf_settings").select("*").eq("id", 1).single();
  const settings = data as unknown as {
    wp_url: string; ck: string | null; cs: string | null; form_id: number; field_map: GFFieldMap;
  } | null;

  if (!settings || !settings.ck || !settings.cs) return { error: "Configuration incomplète (ck/cs manquants)." };

  const gfSettings: GFSettings = {
    wp_url: settings.wp_url,
    ck: settings.ck,
    cs: settings.cs,
    form_id: settings.form_id,
    field_map: settings.field_map,
  };

  // Use service role to bypass RLS for the bulk insert
  const admin = createAdminClient();
  const stats = await syncGravityForms(gfSettings, admin as unknown as Parameters<typeof syncGravityForms>[1]);

  await admin
    .from("gf_settings")
    .update({ last_synced_at: new Date().toISOString(), last_sync_count: stats.created })
    .eq("id", 1);

  revalidatePath("/admin/integrations/gravity-forms");
  revalidatePath("/rh/candidates");
  revalidatePath("/rh");
  return { stats };
}
