"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function addDepartmentAction(formData: FormData) {
  await requireRole(["admin"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Nom requis." };
  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({ name });
  if (error) return { error: error.message };
  revalidatePath("/admin/departments");
  return { ok: true };
}

export async function deleteDepartmentAction(id: string) {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/departments");
  return { ok: true };
}
