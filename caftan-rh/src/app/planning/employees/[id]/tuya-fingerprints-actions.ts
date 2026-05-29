"use server";

// Karim 2026-05-29 : actions pour gerer les empreintes Tuya d un employee
// (plusieurs slots possibles sur 1 ou plusieurs terminaux).
// Cas d usage :
// - Omaima qui a slots 49, 50, 101 sur Pointage A (in/out + reenrolement)
// - Employees qui pointent sur plusieurs sites (Pointage A + Pointage E)
// - Reenrolement post-perte de doigt
// - Anvers : un seul doigt par employee (info Karim 29/05) mais on garde
//   le multi-slot au cas ou.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FingerprintMapping = {
  id: string;
  tuya_device_id: string;
  tuya_device_name: string | null;
  tuya_user_id: string | null;
  tuya_user_id_alpha: string | null;
  tuya_name: string | null;
  direction: string | null;
  is_active: boolean;
};

/**
 * Liste tous les mappings Tuya actifs pour un employee (tous terminaux).
 */
export async function listEmployeeFingerprintsAction(
  employeeId: string,
): Promise<{ data?: FingerprintMapping[]; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  if (!employeeId) return { error: "Employee invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tuya_user_mapping")
    .select(`
      id, tuya_device_id, tuya_user_id, tuya_user_id_alpha, tuya_name, direction, is_active,
      device:tuya_devices(tuya_device_name)
    `)
    .eq("employee_id", employeeId)
    .order("tuya_device_id");
  if (error) return { error: error.message };
  type RawRow = Omit<FingerprintMapping, "tuya_device_name"> & {
    device?: { tuya_device_name: string | null } | Array<{ tuya_device_name: string | null }> | null;
  };
  const mappings = ((data ?? []) as unknown as RawRow[]).map((m) => {
    const dev = Array.isArray(m.device) ? m.device[0] : m.device;
    return {
      id: m.id,
      tuya_device_id: m.tuya_device_id,
      tuya_device_name: dev?.tuya_device_name ?? null,
      tuya_user_id: m.tuya_user_id,
      tuya_user_id_alpha: m.tuya_user_id_alpha,
      tuya_name: m.tuya_name,
      direction: m.direction,
      is_active: m.is_active,
    };
  });
  return { data: mappings };
}

/**
 * Ajoute un nouveau mapping (slot) pour l employee.
 */
export async function addFingerprintMappingAction(args: {
  employeeId: string;
  tuyaDeviceId: string;
  tuyaUserId: string;
  tuyaName?: string;
}): Promise<{ ok?: true; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.employeeId || !args.tuyaDeviceId || !args.tuyaUserId) {
    return { error: "Champs requis manquants." };
  }
  const supabase = await createClient();

  // Verifie qu il n existe pas deja
  const { data: existing } = await supabase
    .from("tuya_user_mapping")
    .select("id, employee_id, is_active")
    .eq("tuya_device_id", args.tuyaDeviceId)
    .eq("tuya_user_id", args.tuyaUserId)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; employee_id: string; is_active: boolean };
    if (row.employee_id !== args.employeeId) {
      return { error: `Ce slot est deja mappe a un autre employee (id: ${row.employee_id.slice(0, 8)}). Desactive d abord ce mapping.` };
    }
    // Reactive si inactif
    if (!row.is_active) {
      const { error } = await supabase.from("tuya_user_mapping").update({ is_active: true }).eq("id", row.id);
      if (error) return { error: error.message };
    }
    return { ok: true };
  }

  // Insert nouveau mapping
  const { error } = await supabase.from("tuya_user_mapping").insert({
    tuya_device_id: args.tuyaDeviceId,
    tuya_user_id: args.tuyaUserId,
    employee_id: args.employeeId,
    direction: "in",
    tuya_name: args.tuyaName ?? `Ajoute par ${profile.full_name ?? "RH"} le ${new Date().toISOString().slice(0, 10)}`,
    is_active: true,
  });
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${args.employeeId}`);
  return { ok: true };
}

/**
 * Desactive un mapping (sans le supprimer pour garder l audit).
 */
export async function deactivateFingerprintMappingAction(
  mappingId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!mappingId) return { error: "Mapping invalide." };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("tuya_user_mapping")
    .select("id, employee_id")
    .eq("id", mappingId)
    .maybeSingle();
  if (!row) return { error: "Mapping introuvable." };
  const m = row as { id: string; employee_id: string };

  const { error } = await supabase
    .from("tuya_user_mapping")
    .update({ is_active: false })
    .eq("id", mappingId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${m.employee_id}`);
  return { ok: true };
}
