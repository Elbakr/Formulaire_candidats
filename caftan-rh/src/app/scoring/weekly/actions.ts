"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function upsertWeeklyRatingAction(input: {
  employeeId: string;
  weekMonday: string; // YYYY-MM-DD (lundi)
  rating: number;
  comment?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  if (!input.employeeId || !input.weekMonday) return { error: "Champs requis manquants." };
  if (!Number.isFinite(input.rating) || input.rating < 1 || input.rating > 5) {
    return { error: "Note invalide (1-5)." };
  }
  const supabase = await createClient();
  const payload = {
    employee_id: input.employeeId,
    rater_profile_id: profile.id,
    week_monday: input.weekMonday,
    rating: input.rating,
    comment: input.comment?.trim() ? input.comment.trim() : null,
  };
  const { error } = await supabase
    .from("weekly_employee_ratings")
    .upsert(payload, { onConflict: "employee_id,week_monday" });
  if (error) return { error: error.message };
  revalidatePath("/scoring/weekly");
  revalidatePath("/me/scoring");
  revalidatePath(`/scoring/${input.employeeId}`);
  return { ok: true };
}

export async function clearWeeklyRatingAction(input: {
  ratingId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  if (!input.ratingId) return { error: "ID requis." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("weekly_employee_ratings")
    .delete()
    .eq("id", input.ratingId);
  if (error) return { error: error.message };
  revalidatePath("/scoring/weekly");
  return { ok: true };
}
