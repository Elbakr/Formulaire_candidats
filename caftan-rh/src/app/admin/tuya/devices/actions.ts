"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { getTuyaDeviceDetail, testTuyaConnection } from "@/lib/tuya-client";

export type UpdateDevicePayload = {
  tuya_device_id: string;
  tuya_device_name?: string;
  site_id?: string | null;
  fallback_for_site_ids?: string[];
  is_pointage?: boolean;
  is_active?: boolean;
  notes?: string | null;
};

export async function updateTuyaDeviceAction(payload: UpdateDevicePayload) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.tuya_device_name !== undefined) update.tuya_device_name = payload.tuya_device_name;
  if (payload.site_id !== undefined) update.site_id = payload.site_id;
  if (payload.fallback_for_site_ids !== undefined) update.fallback_for_site_ids = payload.fallback_for_site_ids;
  if (payload.is_pointage !== undefined) update.is_pointage = payload.is_pointage;
  if (payload.is_active !== undefined) update.is_active = payload.is_active;
  if (payload.notes !== undefined) update.notes = payload.notes;
  const { error } = await supabase
    .from("tuya_devices")
    .update(update)
    .eq("tuya_device_id", payload.tuya_device_id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/tuya/devices");
  return { ok: true as const };
}

/**
 * Rafraichit online/last_seen/custom_name depuis l API Tuya pour tous les devices
 * enregistres en base. Retourne un resume.
 */
export async function syncFromTuyaAction() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data: devices, error } = await supabase
    .from("tuya_devices")
    .select("tuya_device_id, tuya_device_name");
  if (error) return { ok: false as const, error: error.message, synced: 0, failed: 0, errors: [] as string[] };

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const d of devices ?? []) {
    try {
      const detail = await getTuyaDeviceDetail(d.tuya_device_id);
      if (!detail) { failed++; errors.push(`${d.tuya_device_id}: pas de detail`); continue; }
      await supabase
        .from("tuya_devices")
        .update({
          online: detail.is_online,
          last_seen_at: new Date().toISOString(),
          category: detail.category,
          product_name: detail.product_name ?? null,
          // Si le custom_name app Smart Life diffère du nom CaftanRH, on ne l ecrase pas
          // automatiquement - Karim peut decider de renommer manuellement.
          updated_at: new Date().toISOString(),
        })
        .eq("tuya_device_id", d.tuya_device_id);
      synced++;
    } catch (e) {
      failed++;
      errors.push(`${d.tuya_device_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  revalidatePath("/admin/tuya/devices");
  return { ok: true as const, synced, failed, errors };
}

export async function testTuyaAction() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data: devices } = await supabase
    .from("tuya_devices")
    .select("tuya_device_id")
    .eq("is_active", true);
  const ids = (devices ?? []).map((d) => d.tuya_device_id);
  return await testTuyaConnection(ids);
}
