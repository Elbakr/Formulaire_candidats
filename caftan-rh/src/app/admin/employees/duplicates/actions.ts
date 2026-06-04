"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function archiveEmployeeAction(args: {
  employeeId: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!args.employeeId) return { ok: false, error: "employeeId requis" };
  if (!args.reason || args.reason.trim().length < 3) {
    return { ok: false, error: "Raison requise (minimum 3 caractères)" };
  }

  const admin = createAdminClient();

  const { data: emp } = await admin
    .from("employees")
    .select("id, full_name, status, notes")
    .eq("id", args.employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "Employee introuvable" };
  const e = emp as { id: string; full_name: string; status: string; notes: string | null };

  const stamp = `[ARCHIVÉ ${new Date().toISOString().slice(0, 10)} par ${profile.full_name ?? profile.role}] Raison : ${args.reason.trim()}`;
  const newNotes = e.notes ? `${e.notes}\n---\n${stamp}` : stamp;

  const { error } = await admin
    .from("employees")
    .update({ status: "archived", notes: newNotes })
    .eq("id", args.employeeId);
  if (error) return { ok: false, error: error.message };

  try {
    await admin.from("activity_log").insert({
      profile_id: profile.id,
      action: "employee_archived_duplicate",
      target_type: "employee",
      target_id: args.employeeId,
      body: `Archivage de ${e.full_name} (doublon). Status ${e.status} → archived. Raison : ${args.reason.trim()}.`,
    });
  } catch {/* */}

  revalidatePath("/admin/employees/duplicates");
  revalidatePath("/planning/employees");
  return { ok: true };
}
