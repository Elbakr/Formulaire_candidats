"use server";

// Karim 2026-05-29 : actions Dimona post-signature contrat.
// 1. dimonaMarkPendingAction : cree l entry de rappel (post-signature webhook)
// 2. dimonaMarkDoneAction : RH confirme avoir fait la Dimona manuellement
// 3. dimonaAutoSubmitAction : etape 2 - auto-submit via API ONSS (stub)

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { submitDimonaIn, type DimonaInPayload } from "@/lib/dimona-portal";
import { EMPLOYER_ORGS } from "@/lib/contract-renderer";

/**
 * Karim 2026-05-29 : marque la Dimona comme TRAITEE manuellement (RH a
 * declare via le portail ONSS).
 */
export async function dimonaMarkDoneAction(
  employeeId: string,
  notes?: string,
): Promise<{ ok?: true; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!employeeId) return { error: "Employee invalide." };
  const supabase = await createClient();

  const { error } = await supabase
    .from("dimona_declarations")
    .insert({
      employee_id: employeeId,
      kind: "in",
      submitted_at: new Date().toISOString(),
      submitted_by: profile.full_name ?? "RH",
      status: "completed",
      method: "manual_portal",
      notes: notes ?? `Declare manuellement par ${profile.full_name ?? "RH"} via portail ONSS`,
    });
  if (error) return { error: error.message };

  // Marquer les notifications "dimona_to_do" comme lues pour cet employee
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("kind", "dimona_to_do")
    .contains("data", { employeeId });

  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true };
}

/**
 * Karim 2026-05-29 : ETAPE 2 - tentative d auto-submit Dimona via API.
 * Stub pour l instant - retourne une erreur claire. A activer quand le
 * certificat technique AMD Megastore + acces ONSS sont disponibles.
 */
export async function dimonaAutoSubmitAction(
  employeeId: string,
): Promise<{ ok?: true; dimonaPeriodId?: string; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!employeeId) return { error: "Employee invalide." };
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, full_name, nrn, birth_date, contract_type, start_date, end_date")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { error: "Employee introuvable." };
  const e = emp as {
    id: string;
    full_name: string;
    nrn: string | null;
    birth_date: string | null;
    contract_type: string | null;
    start_date: string | null;
    end_date: string | null;
  };

  if (!e.nrn || !e.birth_date || !e.start_date) {
    return { error: "Manque NRN, date de naissance ou date de debut sur la fiche employee." };
  }

  const org = EMPLOYER_ORGS.amd_megastore;
  const parts = e.full_name.trim().split(/\s+/);
  const payload: DimonaInPayload = {
    employerOnss: org.onss,
    employerBce: org.bce,
    workerNiss: e.nrn,
    workerLastName: parts.slice(1).join(" "),
    workerFirstName: parts[0],
    workerBirthDate: e.birth_date,
    startDate: e.start_date,
    endDate: e.end_date ?? undefined,
    workerType: e.contract_type === "Étudiant" || e.contract_type === "Etudiant" ? "STU" : "OTH",
  };

  const result = await submitDimonaIn(payload);
  if (!result.ok) return { error: result.error };

  // Persiste en BD
  await supabase.from("dimona_declarations").insert({
    employee_id: employeeId,
    kind: "in",
    submitted_at: new Date().toISOString(),
    submitted_by: profile.full_name ?? "RH",
    status: "completed",
    method: "auto_api",
    dimona_period_id: result.dimonaPeriodId,
    notes: `Auto-soumis via API ONSS le ${new Date().toISOString().slice(0, 10)}`,
  });

  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true, dimonaPeriodId: result.dimonaPeriodId };
}
