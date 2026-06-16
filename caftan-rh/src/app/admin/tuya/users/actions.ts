"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { reingestTuyaWindow } from "@/lib/tuya-reingest";

export type AddMappingPayload = {
  tuya_device_id: string;
  tuya_user_id: string;
  employee_id: string;
  direction: "in" | "out";
  tuya_name?: string | null;
};

export async function addMappingAction(payload: AddMappingPayload) {
  await requireRole(["admin"]);
  if (!payload.tuya_device_id || !payload.tuya_user_id || !payload.employee_id) {
    return { ok: false as const, error: "device, tuya_user_id et employé requis" };
  }
  if (payload.direction !== "in" && payload.direction !== "out") {
    return { ok: false as const, error: "direction doit être 'in' ou 'out'" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("tuya_user_mapping").insert({
    tuya_device_id: payload.tuya_device_id,
    tuya_user_id: payload.tuya_user_id,
    employee_id: payload.employee_id,
    direction: payload.direction,
    tuya_name: payload.tuya_name?.trim() || null,
    is_active: true,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/tuya/users");

  // Re-ingestion best-effort : recupere les badges passes droppes sur ce slot.
  try {
    await reingestTuyaWindow({ sinceDays: 2, deviceId: payload.tuya_device_id });
  } catch {
    // Non bloquant.
  }

  return { ok: true as const };
}

export async function updateMappingAction(args: {
  id: string;
  tuya_name?: string | null;
  direction?: "in" | "out";
  is_active?: boolean;
  employee_id?: string;
  tuya_user_id?: string;
  tuya_device_id?: string;
}) {
  await requireRole(["admin"]);
  if (args.direction !== undefined && args.direction !== "in" && args.direction !== "out") {
    return { ok: false as const, error: "direction invalide" };
  }
  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if (args.tuya_name !== undefined) update.tuya_name = args.tuya_name?.trim() || null;
  if (args.direction !== undefined) update.direction = args.direction;
  if (args.is_active !== undefined) update.is_active = args.is_active;
  if (args.employee_id !== undefined) update.employee_id = args.employee_id;
  if (args.tuya_user_id !== undefined) update.tuya_user_id = args.tuya_user_id;
  if (args.tuya_device_id !== undefined) update.tuya_device_id = args.tuya_device_id;
  if (Object.keys(update).length === 0) return { ok: true as const };
  const { error } = await supabase
    .from("tuya_user_mapping")
    .update(update)
    .eq("id", args.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/tuya/users");
  revalidatePath("/admin/tuya/logs");

  // Re-ingestion best-effort si le mapping est (re)active ou si le slot change.
  // On cible le device mis a jour (ou on re-fetche la ligne pour le deduire).
  const shouldReingest = args.is_active === true || args.tuya_user_id !== undefined || args.tuya_device_id !== undefined;
  if (shouldReingest) {
    try {
      // Si le device_id est fourni dans la mise a jour, on l utilise directement.
      // Sinon on laisse reingestTuyaWindow tourner sur tous les devices (leger
      // sur 2j et auto-dedup).
      await reingestTuyaWindow({ sinceDays: 2, deviceId: args.tuya_device_id });
    } catch {
      // Non bloquant.
    }
  }

  return { ok: true as const };
}

export async function listActiveEmployeesAction() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name");
  return { ok: true as const, employees: (data ?? []) as { id: string; full_name: string }[] };
}

export async function deleteMappingAction(id: string) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("tuya_user_mapping").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/admin/tuya/users");
  return { ok: true as const };
}
