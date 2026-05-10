"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export async function assignEmployeeToSiteAction(input: {
  employeeId: string;
  siteId: string;
  startDate: string;
  endDate?: string | null;
  isPrimary?: boolean;
  pct?: number;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  // Insert assignment.
  const { error: insErr } = await supabase.from("site_assignments").insert({
    employee_id: input.employeeId,
    site_id: input.siteId,
    start_date: input.startDate,
    end_date: input.endDate ?? null,
    is_primary: !!input.isPrimary,
    pct: input.pct ?? 100,
  });
  if (insErr) return { error: insErr.message };

  // Auto-join chat group du site (si l'employé a un profil).
  const { data: emp } = await supabase
    .from("employees")
    .select("profile_id")
    .eq("id", input.employeeId)
    .maybeSingle();
  const profileId = (emp as { profile_id: string | null } | null)?.profile_id ?? null;

  if (profileId) {
    const { data: room } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("kind", "site_group")
      .eq("site_id", input.siteId)
      .maybeSingle();
    if (room) {
      // ON CONFLICT DO NOTHING via upsert ignoreDuplicates.
      await supabase
        .from("chat_room_members")
        .upsert(
          { room_id: (room as { id: string }).id, profile_id: profileId, role: "member" },
          { onConflict: "room_id,profile_id", ignoreDuplicates: true },
        );
    }
  }

  revalidatePath(`/planning/employees/${input.employeeId}`);
  revalidatePath("/planning/sites");
  revalidatePath("/chat");
  return { ok: true };
}

export async function endAssignmentAction(input: {
  assignmentId: string;
  employeeId: string;
  endDate: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_assignments")
    .update({ end_date: input.endDate })
    .eq("id", input.assignmentId);
  if (error) return { error: error.message };
  revalidatePath(`/planning/employees/${input.employeeId}`);
  revalidatePath("/planning/sites");
  return { ok: true };
}

export async function deleteAssignmentAction(input: {
  assignmentId: string;
  employeeId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_assignments")
    .delete()
    .eq("id", input.assignmentId);
  if (error) return { error: error.message };
  revalidatePath(`/planning/employees/${input.employeeId}`);
  revalidatePath("/planning/sites");
  return { ok: true };
}
