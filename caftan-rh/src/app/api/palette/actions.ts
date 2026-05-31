"use server";

// Karim 2026-05-31 : server actions pour la Command Palette Cmd+K.
// Recherche limitée aux employees actifs + en congé (cohérent avec
// listActiveEmployeesAction côté payslips).

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export async function searchEmployeesForPaletteAction(
  q: string,
): Promise<{ ok: boolean; employees: Array<{ id: string; full_name: string; status: string }> }> {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();
  const { data } = await admin
    .from("employees")
    .select("id, full_name, status")
    .ilike("full_name", `%${q}%`)
    .in("status", ["active", "on_leave"])
    .order("full_name")
    .limit(8);
  return { ok: true, employees: data ?? [] };
}
