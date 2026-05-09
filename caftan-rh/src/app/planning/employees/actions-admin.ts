"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

const NUM = (v: FormDataEntryValue | null) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const STR = (v: FormDataEntryValue | null) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const ARR = (v: FormDataEntryValue | null) => {
  if (v == null) return [];
  try { const a = JSON.parse(String(v)); return Array.isArray(a) ? a : []; } catch { return []; }
};

export async function saveEmployeeAdminAction(employeeId: string, formData: FormData) {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const dept = STR(formData.get("department_id"));
  const manager = STR(formData.get("manager_id"));

  const payload = {
    full_name: STR(formData.get("full_name")),
    email: STR(formData.get("email"))?.toLowerCase(),
    phone: STR(formData.get("phone")),
    job_title: STR(formData.get("job_title")),
    department_id: dept === "none" ? null : dept,
    manager_id: manager === "none" ? null : manager,
    contract_type: STR(formData.get("contract_type")),
    status: STR(formData.get("status")) ?? "active",
    weekly_hours: NUM(formData.get("weekly_hours")),
    hourly_rate: NUM(formData.get("hourly_rate")),
    start_date: STR(formData.get("start_date")),
    end_date: STR(formData.get("end_date")),
    trial_end_date: STR(formData.get("trial_end_date")),
    annual_hours_budget: NUM(formData.get("annual_hours_budget")),
    nrn: STR(formData.get("nrn")),
    cin_number: STR(formData.get("cin_number")),
    address: STR(formData.get("address")),
    postal_code: STR(formData.get("postal_code")),
    city: STR(formData.get("city")),
    iban: STR(formData.get("iban")),
    bic: STR(formData.get("bic")),
    bank_holder: STR(formData.get("bank_holder")),
    transport_type: STR(formData.get("transport_type")),
    transport_price: STR(formData.get("transport_price")),
    fixed_off_days: ARR(formData.get("fixed_off_days")),
    preferred_site_ids: ARR(formData.get("preferred_site_ids")),
    unavailable_site_ids: ARR(formData.get("unavailable_site_ids")),
    default_start_time: STR(formData.get("default_start_time")),
    default_pause_minutes: NUM(formData.get("default_pause_minutes")) ?? 30,
    default_shift_hours: NUM(formData.get("default_shift_hours")) ?? 8,
    wd_mode: STR(formData.get("wd_mode")) ?? "auto",
    week_cycle: NUM(formData.get("week_cycle")) ?? 1,
    week_phase: NUM(formData.get("week_phase")) ?? 0,
    planning_notes: STR(formData.get("planning_notes")),
    notes_admin: STR(formData.get("notes_admin")),
  };

  const { error } = await supabase.from("employees").update(payload).eq("id", employeeId);
  if (error) return { error: error.message };

  revalidatePath(`/planning/employees/${employeeId}`);
  revalidatePath("/planning/employees");
  return { ok: true };
}
