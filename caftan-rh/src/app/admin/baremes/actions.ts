"use server";

// Karim 2026-07-04 : CRUD des barèmes de salaire (plancher éditable). Admin/RH.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertBaremeAction(input: {
  id?: string;
  contract_kind: string;
  age_min: number | null;
  age_max: number | null;
  hourly_rate: number;
  label: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  if (!input.hourly_rate || input.hourly_rate <= 0) return { ok: false, error: "Taux horaire invalide." };
  const row = {
    contract_kind: input.contract_kind.trim() || "default",
    age_min: input.age_min,
    age_max: input.age_max,
    hourly_rate: input.hourly_rate,
    label: input.label?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = input.id
    ? await admin.from("wage_baremes").update(row).eq("id", input.id)
    : await admin.from("wage_baremes").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/baremes");
  return { ok: true };
}

export async function deleteBaremeAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { error } = await admin.from("wage_baremes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/baremes");
  return { ok: true };
}
