"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

// Karim 15/05/2026 : "il faut que le RH puisse au travers une seule page
// modifier le maximum de donnees dont le besoin est impose par le solver".
// Cette action prend un patch partiel d employe et met a jour uniquement
// les champs fournis. Pratique pour l edition inline ligne par ligne.

export type EmployeeBulkPatch = {
  weekly_hours?: number | null;
  contract_type?: string | null;
  default_pause_minutes?: number | null;
  ot_eligible?: boolean;
  /** Karim 15/05 : niveau OT max par employe (1.0 = pas d OT, 2.0 = double).
   *  Si > 1.0, ot_eligible est setted a true via trigger DB. */
  ot_max_multiplier?: number;
  fixed_off_days?: number[];
  preferred_site_ids?: string[];
  unavailable_site_ids?: string[];
  status?: "active" | "on_leave" | "archived";
};

const ALLOWED_FIELDS = new Set<keyof EmployeeBulkPatch>([
  "weekly_hours",
  "contract_type",
  "default_pause_minutes",
  "ot_eligible",
  "ot_max_multiplier",
  "fixed_off_days",
  "preferred_site_ids",
  "unavailable_site_ids",
  "status",
]);

export async function updateEmployeeBulkAction(
  employeeId: string,
  patch: EmployeeBulkPatch,
): Promise<{ ok?: boolean; error?: string }> {
  await requireRole(["admin", "rh"]);
  if (!employeeId) return { error: "employeeId requis" };

  const supabase = await createClient();
  // On filtre les champs non autorises pour eviter qu un client pousse des
  // colonnes sensibles (hourly_rate, iban, etc.) via cette action.
  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as Array<keyof EmployeeBulkPatch>) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    payload[key] = patch[key];
  }
  if (Object.keys(payload).length === 0) {
    return { error: "Aucun champ a mettre a jour." };
  }

  const { error } = await supabase
    .from("employees")
    .update(payload)
    .eq("id", employeeId);
  if (error) return { error: error.message };

  revalidatePath("/planning/employees");
  revalidatePath(`/planning/employees/${employeeId}`);
  revalidatePath("/planning/employees/bulk-edit");
  return { ok: true };
}
