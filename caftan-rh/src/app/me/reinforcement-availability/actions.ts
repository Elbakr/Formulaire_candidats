"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

// ─────────────────────────────────────────────────────────────
// Helper interne
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// addAvailabilitySlot
// ─────────────────────────────────────────────────────────────

export type AddAvailabilitySlotInput = {
  /** Créneau récurrent : 0=Dim, 1=Lun…6=Sam. Null si ponctuel. */
  day_of_week: number | null;
  /** Créneau ponctuel : "YYYY-MM-DD". Null si récurrent. */
  specific_date: string | null;
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  note: string;
};

export async function addAvailabilitySlot(
  input: AddAvailabilitySlotInput,
): Promise<{ ok?: true; error?: string }> {
  // Validation
  if (input.day_of_week == null && !input.specific_date) {
    return { error: "Indiquez un jour récurrent ou une date précise." };
  }
  if (input.day_of_week != null && input.specific_date) {
    return { error: "Choisissez soit un jour récurrent, soit une date précise — pas les deux." };
  }
  if (input.day_of_week != null && (input.day_of_week < 0 || input.day_of_week > 6)) {
    return { error: "Jour de semaine invalide (0–6 attendu)." };
  }
  if (!input.start_time || !input.end_time) {
    return { error: "L'heure de début et de fin sont obligatoires." };
  }
  if (input.start_time >= input.end_time) {
    return { error: "L'heure de début doit être avant l'heure de fin." };
  }

  const me = await getMyEmployee();
  if ("error" in me) return me;

  const supabase = await createClient();
  const { error } = await supabase.from("employee_availability").insert({
    employee_id: me.id,
    day_of_week: input.day_of_week,
    specific_date: input.specific_date || null,
    start_time: input.start_time,
    end_time: input.end_time,
    note: input.note.trim() || null,
    available_for_reinforcement: true,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/me/reinforcement-availability");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// removeAvailabilitySlot
// ─────────────────────────────────────────────────────────────

export async function removeAvailabilitySlot(
  availabilityId: string,
): Promise<{ ok?: true; error?: string }> {
  if (!availabilityId) return { error: "ID manquant." };

  const me = await getMyEmployee();
  if ("error" in me) return me;

  const supabase = await createClient();

  // Soft-delete : is_active = false (préserve l'historique)
  const { error } = await supabase
    .from("employee_availability")
    .update({ is_active: false })
    .eq("id", availabilityId)
    .eq("employee_id", me.id);  // double sécurité, la RLS vérifie aussi

  if (error) return { error: error.message };

  revalidatePath("/me/reinforcement-availability");
  return { ok: true };
}
