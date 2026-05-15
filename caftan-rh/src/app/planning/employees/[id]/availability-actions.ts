"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

// Karim 15/05/2026 : actions admin/RH pour gerer les dispos d un employe
// cible. Memes ecritures que /me/availability/actions.ts mais sans le
// "self-only" (on prend employeeId en parametre). 2-way sync : l employe
// continue d ajouter/supprimer via /me/availability ; le RH gere les memes
// rows via la fiche employe.

export async function addEmployeeUnavailabilityAdminAction(args: {
  employeeId: string;
  mode: "recurring" | "specific";
  day_of_week?: number | null;
  date_specific?: string | null;
  start_time: string | null;
  end_time: string | null;
  reason?: string | null;
  notes?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  if (args.mode === "recurring") {
    const dow = args.day_of_week ?? -1;
    if (dow < 0 || dow > 6) return { error: "Choisis un jour de semaine." };
    if (!args.start_time || !args.end_time) {
      return { error: "Heure début et fin requises." };
    }
    if (args.start_time >= args.end_time) {
      return { error: "L'heure de fin doit être après le début." };
    }
    const { error } = await supabase.from("employee_unavailabilities").insert({
      employee_id: args.employeeId,
      day_of_week: dow,
      start_time: args.start_time,
      end_time: args.end_time,
      reason: args.reason ?? null,
      notes: args.notes ?? null,
    });
    if (error) return { error: error.message };
  } else {
    if (!args.date_specific) return { error: "Date requise." };
    if (args.start_time && args.end_time && args.start_time >= args.end_time) {
      return { error: "L'heure de fin doit être après le début." };
    }
    const { error } = await supabase.from("employee_unavailabilities").insert({
      employee_id: args.employeeId,
      date_specific: args.date_specific,
      start_time: args.start_time,
      end_time: args.end_time,
      reason: args.reason ?? null,
      notes: args.notes ?? null,
    });
    if (error) return { error: error.message };
  }
  revalidatePath(`/planning/employees/${args.employeeId}`);
  revalidatePath("/me/availability");
  return { ok: true };
}

export async function deleteEmployeeUnavailabilityAdminAction(
  unavailId: string,
  employeeId: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  if (!unavailId || !employeeId) return { error: "Param requis." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_unavailabilities")
    .delete()
    .eq("id", unavailId)
    .eq("employee_id", employeeId);
  if (error) return { error: error.message };
  revalidatePath(`/planning/employees/${employeeId}`);
  revalidatePath("/me/availability");
  return { ok: true };
}

export async function updateEmployeeFixedOffDaysAdminAction(
  employeeId: string,
  days: number[],
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  if (!employeeId) return { error: "employeeId requis." };
  const supabase = await createClient();
  const clean = Array.from(
    new Set(days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)),
  ).sort();
  const { error } = await supabase
    .from("employees")
    .update({ fixed_off_days: clean })
    .eq("id", employeeId);
  if (error) return { error: error.message };
  revalidatePath(`/planning/employees/${employeeId}`);
  revalidatePath("/me/availability");
  return { ok: true };
}
