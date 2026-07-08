"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/permissions";
import type { AppRole } from "@/types/database.types";

export async function updateUserRoleAction(userId: string, role: AppRole) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUserDepartmentAction(userId: string, departmentId: string | null) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ department_id: departmentId }).eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

// Karim 2026-07-08 : octroi de permissions par utilisateur (ex. fiches de paie).
// Réservé à l'ADMIN — un RH ne peut PAS s'auto-octroyer un droit. On ne garde
// que les clés connues (PERMISSION_KEYS) pour éviter d'écrire n'importe quoi.
export async function updateUserPermissionsAction(userId: string, permissions: string[]) {
  await requireRole(["admin"]);
  const known = new Set(PERMISSION_KEYS.map((p) => p.key as string));
  const cleaned = Array.from(new Set(permissions.filter((p) => known.has(p))));
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ permissions: cleaned }).eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}
