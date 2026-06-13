"use server";

import { createAdminClient } from "@/lib/supabase/server";

// Champs que le TRAVAILLEUR peut renseigner (non adminOnly, cf. contract-readiness).
const ALLOWED = ["full_name", "email", "birth_date", "nrn", "address", "postal_code", "city", "iban"] as const;

export async function submitContractInfoAction(
  token: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: tokRaw } = await admin
    .from("contract_info_tokens")
    .select("id, employee_id, completed_at")
    .eq("token", token)
    .maybeSingle();
  const tok = tokRaw as { id: string; employee_id: string; completed_at: string | null } | null;
  if (!tok) return { ok: false, error: "Lien invalide ou expiré." };

  const update: Record<string, string> = {};
  for (const k of ALLOWED) {
    const v = (values[k] ?? "").trim();
    if (v) update[k] = v;
  }
  if (Object.keys(update).length === 0) return { ok: false, error: "Aucune information saisie." };

  const { error } = await admin.from("employees").update(update).eq("id", tok.employee_id);
  if (error) return { ok: false, error: error.message };
  await admin.from("contract_info_tokens").update({ completed_at: new Date().toISOString() }).eq("id", tok.id);

  // Notifie RH que le dossier avance.
  try {
    const { data: emp } = await admin.from("employees").select("full_name").eq("id", tok.employee_id).maybeSingle();
    const name = (emp as { full_name?: string } | null)?.full_name ?? "Un employé";
    const { data: rh } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
    const inserts = ((rh ?? []) as Array<{ id: string }>).map((p) => ({
      recipient_id: p.id,
      kind: "reminder" as const,
      title: `Dossier complété : ${name}`,
      body: `${name} a renseigné ses infos manquantes. Le contrat peut avancer.`,
      link: `/planning/employees/${tok.employee_id}`,
      data: { employee_id: tok.employee_id },
    }));
    if (inserts.length > 0) await admin.from("notifications").insert(inserts);
  } catch {
    /* notif best-effort */
  }
  return { ok: true };
}
