"use server";

// Server actions pour l interface mobile "Quick availability" : congés rapides
// et indispos recurrentes/ponctuelles. Karim 20/05 : usage face-a-face, doit
// etre instantane (single tap).

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function toggleRecurringUnavailAction(input: {
  employeeId: string;
  dayOfWeek: number; // 0..6 (0=Dim)
  slot: "am" | "pm" | "full";
}) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const ranges = {
    am: { start: "08:00", end: "12:30" },
    pm: { start: "12:30", end: "20:00" },
    full: { start: "00:00", end: "23:59" },
  };
  const r = ranges[input.slot];

  // Check if exists (recurring = day_of_week set, date_specific null)
  const { data: existing } = await supabase
    .from("employee_unavailabilities")
    .select("id, start_time, end_time, is_active")
    .eq("employee_id", input.employeeId)
    .eq("day_of_week", input.dayOfWeek)
    .is("date_specific", null)
    .eq("start_time", r.start + ":00")
    .eq("end_time", r.end + ":00")
    .maybeSingle();

  if (existing) {
    // Toggle is_active
    const newActive = !existing.is_active;
    const { error } = await supabase
      .from("employee_unavailabilities")
      .update({ is_active: newActive })
      .eq("id", existing.id);
    if (error) return { error: error.message };
    revalidatePath("/quick/availability");
    return { ok: true, action: newActive ? "enabled" : "disabled" };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("employee_unavailabilities").insert({
    employee_id: input.employeeId,
    day_of_week: input.dayOfWeek,
    date_specific: null,
    start_time: r.start,
    end_time: r.end,
    reason: `Indispo recurrente ${input.slot}`,
    is_active: true,
    created_by: user?.id ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/quick/availability");
  return { ok: true, action: "created" };
}

export async function addSpecificUnavailAction(input: {
  employeeId: string;
  date: string;
  slot: "am" | "pm" | "full";
  reason?: string | null;
}) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const ranges = {
    am: { start: "08:00", end: "12:30" },
    pm: { start: "12:30", end: "20:00" },
    full: { start: "00:00", end: "23:59" },
  };
  const r = ranges[input.slot];

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("employee_unavailabilities").insert({
    employee_id: input.employeeId,
    day_of_week: null,
    date_specific: input.date,
    start_time: r.start,
    end_time: r.end,
    reason: input.reason ?? `Indispo ponctuelle ${input.slot}`,
    is_active: true,
    created_by: user?.id ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/quick/availability");
  return { ok: true };
}

export async function deleteUnavailAction(input: { id: string }) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_unavailabilities")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/quick/availability");
  return { ok: true };
}
