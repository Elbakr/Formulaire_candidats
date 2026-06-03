"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function rehireEmployeeAction(args: {
  employeeId: string;
  startDate: string;
  endDate?: string;
  contractType: string;
  weeklyHours: number;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data: emp } = await admin
    .from("employees")
    .select("id, full_name, status, notes")
    .eq("id", args.employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "Employee introuvable" };
  const empData = emp as { id: string; full_name: string; status: string; notes: string | null };

  const wtKind = args.weeklyHours >= 36 ? "full" : "part";
  const prevNotes = empData.notes ? `${empData.notes}\n---\n` : "";
  const rehireNote = `[RÉEMBAUCHE ${new Date().toISOString().slice(0, 10)} par ${profile.full_name ?? profile.role}]\n` +
    `Période : ${args.startDate}${args.endDate ? ` → ${args.endDate}` : ""}\n` +
    `Contrat : ${args.contractType} ${args.weeklyHours}h/sem\n` +
    (args.note ? `Note : ${args.note}\n` : "");

  const { error } = await admin
    .from("employees")
    .update({
      status: "active",
      contract_type: args.contractType,
      weekly_hours: args.weeklyHours,
      work_time_kind: wtKind,
      start_date: args.startDate,
      end_date: args.endDate ?? null,
      notes: prevNotes + rehireNote,
    })
    .eq("id", args.employeeId);
  if (error) return { ok: false, error: error.message };

  // Log activity
  try {
    await admin.from("activity_log").insert({
      profile_id: profile.id,
      action: "employee_rehired",
      target_type: "employee",
      target_id: args.employeeId,
      body: `Réembauche de ${empData.full_name}. Status ${empData.status} → active. Contrat ${args.contractType} ${args.weeklyHours}h, ${args.startDate}${args.endDate ? ` → ${args.endDate}` : ""}.`,
    });
  } catch { /* */ }

  revalidatePath(`/planning/employees/${args.employeeId}`);
  revalidatePath("/planning/employees");
  return { ok: true };
}
