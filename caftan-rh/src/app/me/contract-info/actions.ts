"use server";

// Karim 2026-06-04 : action server qui sauve les champs du formulaire dynamique
// /me/contract-info. Update employee row du worker connecte (RLS impose
// que profile_id = auth.uid, donc pas de risque cross-account).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isoMinusYears } from "@/lib/be-validators";

const ALLOWED_FIELDS = [
  "full_name", "email", "phone",
  "birth_date", "nrn", "address", "postal_code", "city",
  "iban", "bic",
  "transport_type", "transport_frequency",
];

export async function saveContractInfoAction(
  fd: FormData,
): Promise<{ ok?: true; error?: string; completed?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  // Find the employee row of this profile
  const { data: emp } = await supabase
    .from("employees")
    .select("id, contract_type")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!emp) return { error: "Aucune fiche employé liée à ce compte" };

  const updates: Record<string, string | null> = {};
  for (const key of ALLOWED_FIELDS) {
    const v = fd.get(key);
    if (v != null) {
      const s = String(v).trim();
      if (s.length > 0) updates[key] = s;
    }
  }

  if (Object.keys(updates).length === 0) {
    return { error: "Aucun champ à mettre à jour" };
  }

  // Karim 2026-06-15 : garde-fou serveur — âge minimum 17 ans.
  if (typeof updates.birth_date === "string" && updates.birth_date > isoMinusYears(17)) {
    return { error: "La date de naissance doit correspondre à au moins 17 ans." };
  }

  // Karim 2026-06-17 : horodate la soumission par le travailleur (statut admin).
  const nowIso = new Date().toISOString();
  const { data: subRow } = await supabase
    .from("employees")
    .select("worker_field_submissions")
    .eq("id", (emp as { id: string }).id)
    .maybeSingle();
  const submissions: Record<string, string> = {
    ...(((subRow as { worker_field_submissions?: Record<string, string> } | null)?.worker_field_submissions) ?? {}),
  };
  for (const k of Object.keys(updates)) submissions[k] = nowIso;

  const { error } = await supabase
    .from("employees")
    .update({ ...updates, worker_field_submissions: submissions })
    .eq("id", (emp as { id: string }).id);
  if (error) return { error: error.message };

  // Recheck completeness pour signaler au RH
  try {
    const { data: empNow } = await supabase
      .from("employees")
      .select("*")
      .eq("id", (emp as { id: string }).id)
      .single();
    const { getMissingFields } = await import("@/lib/contract-readiness");
    const missing = getMissingFields(empNow as unknown as Record<string, unknown>, (emp as { contract_type: string | null }).contract_type);
    const candidateMissing = missing.filter((m) => !m.adminOnly);
    const completed = candidateMissing.length === 0;

    // Si l'employee vient de tout completer, notif RH
    if (completed) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const admin = createAdminClient();
        const { data: hrs } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
        const hrIds = ((hrs ?? []) as Array<{ id: string }>).map((h) => h.id);
        if (hrIds.length > 0) {
          await admin.from("notifications").insert(hrIds.map((hrId) => ({
            recipient_id: hrId,
            kind: "contract_info_complete",
            title: `✅ Dossier complet — ${(empNow as { full_name?: string })?.full_name ?? "?"}`,
            body: `Le worker a complété ses infos via le formulaire dynamique. Le contrat peut être envoyé à signer.`,
            link: `/planning/employees/${(emp as { id: string }).id}`,
            data: { employeeId: (emp as { id: string }).id },
          })));
        }
      } catch {/* */}
    }

    revalidatePath("/me/contract-info");
    revalidatePath("/me/profile");
    revalidatePath(`/planning/employees/${(emp as { id: string }).id}`);
    return { ok: true, completed };
  } catch {/* */}

  return { ok: true };
}
