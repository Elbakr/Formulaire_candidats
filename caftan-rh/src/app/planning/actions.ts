"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireProfile } from "@/lib/auth";

export async function upsertShiftAction(formData: FormData) {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const id = String(formData.get("id") ?? "") || null;
  const employeeId = String(formData.get("employee_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("start_time") ?? "");
  const end = String(formData.get("end_time") ?? "");
  const breakMinutes = Number(formData.get("break_minutes") ?? 0);
  const position = String(formData.get("position") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!employeeId || !date || !start || !end) return { error: "Employé, date et horaires requis." };
  if (start >= end) return { error: "L'heure de fin doit être après l'heure de début." };

  const supabase = await createClient();
  const payload = {
    employee_id: employeeId,
    date,
    start_time: start,
    end_time: end,
    break_minutes: breakMinutes,
    position,
    location,
    notes,
    created_by: profile.id,
  };

  if (id) {
    const { error } = await supabase.from("shifts").update(payload).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("shifts").insert(payload);
    if (error) return { error: error.message };
  }
  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true };
}

export async function deleteShiftAction(id: string) {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/planning", "layout");
  revalidatePath("/me/planning");
  return { ok: true };
}

export async function decideTimeOffAction(id: string, decision: "approved" | "rejected") {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("time_off_requests")
    .update({
      status: decision,
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/planning/time-off");
  revalidatePath("/me/time-off");
  return { ok: true };
}

export async function createEmployeeAction(formData: FormData) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const contractType = String(formData.get("contract_type") ?? "CDI").trim();
  const weeklyHours = Number(formData.get("weekly_hours") ?? 38);
  const departmentId = String(formData.get("department_id") ?? "") || null;
  const startDate = String(formData.get("start_date") ?? "") || new Date().toISOString().split("T")[0];

  if (!email || !fullName) return { error: "Nom et email requis." };

  const { error } = await supabase.from("employees").insert({
    email, full_name: fullName, job_title: jobTitle || "À définir",
    contract_type: contractType, weekly_hours: weeklyHours,
    department_id: departmentId, start_date: startDate,
  });
  if (error) return { error: error.message };
  revalidatePath("/planning/employees");
  return { ok: true };
}

export async function archiveEmployeeAction(id: string) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ status: "archived", end_date: new Date().toISOString().split("T")[0] })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/planning/employees");
  return { ok: true };
}

export async function requestTimeOffAction(formData: FormData) {
  const { user } = await requireProfile();
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const e = emp as unknown as { id: string } | null;
  if (!e?.id) return { error: "Tu n'es pas enregistré comme employé actif." };

  const kind = String(formData.get("kind") ?? "vacation");
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!startDate || !endDate) return { error: "Dates requises." };
  if (startDate > endDate) return { error: "La date de fin doit être après la date de début." };

  const { error } = await supabase.from("time_off_requests").insert({
    employee_id: e.id,
    kind: kind as "vacation" | "sick" | "personal" | "unpaid" | "other",
    start_date: startDate,
    end_date: endDate,
    reason,
  });
  if (error) return { error: error.message };
  revalidatePath("/me/time-off");
  revalidatePath("/planning/time-off");
  return { ok: true };
}

export async function cancelTimeOffAction(id: string) {
  const { user } = await requireProfile();
  const supabase = await createClient();
  // RLS ensures only own pending requests can be updated
  const { error } = await supabase
    .from("time_off_requests")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/me/time-off");
  return { ok: true };
}
