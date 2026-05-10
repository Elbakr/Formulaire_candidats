"use server";

// Server actions pour /admin/holidays.
// 3 entités CRUD : holidays, school_breaks, company_closures.
// Plus une action utilitaire : `reseedBelgianHolidaysAction(year)` qui (re)pose
// les 10 jours fériés légaux belges pour une année donnée — idempotent grâce
// à la contrainte unique (date, label, country).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { belgianHolidaysFor } from "@/lib/holidays/be";

// ─── Holidays (jours fériés ponctuels) ──────────────────────────────────────

export async function addHolidayAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const date = String(formData.get("date") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const kind = String(formData.get("kind") ?? "legal").trim();
  const region = String(formData.get("region") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!date || !label) return { error: "Date et libellé requis." };
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").insert({
    date,
    label,
    kind,
    country: "BE",
    region,
    notes,
    is_active: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/holidays");
  return { ok: true };
}

export async function deleteHolidayAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/holidays");
  return { ok: true };
}

export async function toggleHolidayActiveAction(id: string, isActive: boolean) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("holidays")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/holidays");
  return { ok: true };
}

export async function reseedBelgianHolidaysAction(year: number) {
  await requireRole(["admin", "rh"]);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    return { error: "Année invalide." };
  }
  const supabase = await createClient();
  const list = belgianHolidaysFor(year);
  let inserted = 0;
  let skipped = 0;
  for (const h of list) {
    const { data: existing } = await supabase
      .from("holidays")
      .select("id")
      .eq("date", h.date)
      .eq("label", h.label)
      .eq("country", "BE")
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    const { error } = await supabase.from("holidays").insert({
      date: h.date,
      label: h.label,
      kind: "legal",
      country: "BE",
      recurring_yearly: true,
      is_active: true,
    });
    if (error) return { error: error.message };
    inserted += 1;
  }
  revalidatePath("/admin/holidays");
  return { ok: true, inserted, skipped };
}

// ─── School breaks (vacances scolaires) ─────────────────────────────────────

export async function addSchoolBreakAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const label = String(formData.get("label") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const region = String(formData.get("region") ?? "BE-BRU").trim() || "BE-BRU";
  if (!label || !startDate || !endDate) return { error: "Tous les champs requis." };
  if (endDate < startDate) return { error: "La date de fin doit être après la date de début." };
  const supabase = await createClient();
  const { error } = await supabase.from("school_breaks").insert({
    label,
    start_date: startDate,
    end_date: endDate,
    region,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/holidays");
  return { ok: true };
}

export async function deleteSchoolBreakAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("school_breaks").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/holidays");
  return { ok: true };
}

// ─── Company closures (fermetures boutique) ────────────────────────────────

export async function addCompanyClosureAction(formData: FormData) {
  const { user } = await requireRole(["admin", "rh"]);
  const label = String(formData.get("label") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const departmentRaw = String(formData.get("department_id") ?? "").trim();
  const departmentId = departmentRaw && departmentRaw !== "all" ? departmentRaw : null;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!label || !startDate || !endDate) return { error: "Libellé et dates requis." };
  if (endDate < startDate) return { error: "La date de fin doit être après la date de début." };
  const supabase = await createClient();
  const { error } = await supabase.from("company_closures").insert({
    label,
    start_date: startDate,
    end_date: endDate,
    department_id: departmentId,
    reason,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/holidays");
  return { ok: true };
}

export async function deleteCompanyClosureAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase.from("company_closures").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/holidays");
  return { ok: true };
}
