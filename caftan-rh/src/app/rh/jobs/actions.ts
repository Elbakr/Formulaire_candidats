"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function createJobAction(formData: FormData) {
  const { profile } = await requireRole(["admin", "rh"]);
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const contractType = String(formData.get("contract_type") ?? "").trim() || null;
  const departmentId = String(formData.get("department_id") ?? "") || null;
  if (!title) return { error: "Titre requis." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .insert({
      title,
      description,
      location,
      contract_type: contractType,
      department_id: departmentId,
      created_by: profile.id,
      is_open: true,
    });
  if (error) return { error: error.message };
  revalidatePath("/rh/jobs");
  revalidatePath("/postuler");
  return { ok: true };
}

export async function toggleJobStatusAction(jobId: string, isOpen: boolean) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("jobs").update({ is_open: isOpen }).eq("id", jobId);
  if (error) return { error: error.message };
  revalidatePath("/rh/jobs");
  revalidatePath("/postuler");
  return { ok: true };
}

export async function deleteJobAction(jobId: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) return { error: error.message };
  revalidatePath("/rh/jobs");
  revalidatePath("/postuler");
  return { ok: true };
}
