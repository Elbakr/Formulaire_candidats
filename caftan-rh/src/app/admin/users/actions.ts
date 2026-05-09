"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
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
