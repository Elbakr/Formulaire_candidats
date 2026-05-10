"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

const STR = (v: FormDataEntryValue | null) =>
  v == null || String(v).trim() === "" ? null : String(v).trim();

const NUM = (v: FormDataEntryValue | null) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const ARR = (v: FormDataEntryValue | null) => {
  if (v == null) return [];
  try {
    const a = JSON.parse(String(v));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};

async function getMyEmployee(): Promise<{ id: string } | { error: string }> {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const e = data as { id: string } | null;
  if (!e?.id) return { error: "Tu n'es pas enregistré comme employé actif." };
  return { id: e.id };
}

export async function updateMyFixedOffDaysAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getMyEmployee();
  if ("error" in me) return me;
  const supabase = await createClient();

  // Clamp 0..6 et dédoublonnage.
  const days = ARR(formData.get("fixed_off_days"))
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const unique = Array.from(new Set(days)).sort();

  const { error } = await supabase
    .from("employees")
    .update({ fixed_off_days: unique })
    .eq("id", me.id);
  if (error) return { error: error.message };
  revalidatePath("/me/availability");
  revalidatePath("/me/planning");
  return { ok: true };
}

export async function addMyUnavailabilityAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getMyEmployee();
  if ("error" in me) return me;
  const supabase = await createClient();

  const mode = String(formData.get("mode") ?? "recurring"); // 'recurring' | 'specific'
  const dow = NUM(formData.get("day_of_week"));
  const dateSpecific = STR(formData.get("date_specific"));
  const startTime = STR(formData.get("start_time"));
  const endTime = STR(formData.get("end_time"));
  const reason = STR(formData.get("reason"));
  const notes = STR(formData.get("notes"));

  if (mode === "recurring") {
    if (dow === null || dow < 0 || dow > 6) return { error: "Choisis un jour de semaine." };
    if (!startTime || !endTime) return { error: "Heure début et fin requises." };
    if (startTime >= endTime) return { error: "L'heure de fin doit être après le début." };
    const { error } = await supabase.from("employee_unavailabilities").insert({
      employee_id: me.id,
      day_of_week: dow,
      start_time: startTime,
      end_time: endTime,
      reason,
      notes,
    });
    if (error) return { error: error.message };
  } else {
    if (!dateSpecific) return { error: "Date requise." };
    // Pour une indispo ponctuelle, l'heure début / fin reste optionnelle
    // (= journée complète si non précisée). Si l'employé veut bloquer une
    // journée entière, on l'incite plutôt à passer par /me/time-off.
    if (startTime && endTime && startTime >= endTime) {
      return { error: "L'heure de fin doit être après le début." };
    }
    const { error } = await supabase.from("employee_unavailabilities").insert({
      employee_id: me.id,
      date_specific: dateSpecific,
      start_time: startTime,
      end_time: endTime,
      reason,
      notes,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/me/availability");
  return { ok: true };
}

export async function deleteMyUnavailabilityAction(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getMyEmployee();
  if ("error" in me) return me;
  const supabase = await createClient();
  // RLS empêche déjà de supprimer celles d'un autre employé, mais on
  // double-check côté serveur pour défense en profondeur.
  const { error } = await supabase
    .from("employee_unavailabilities")
    .delete()
    .eq("id", id)
    .eq("employee_id", me.id);
  if (error) return { error: error.message };
  revalidatePath("/me/availability");
  return { ok: true };
}
