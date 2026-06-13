"use server";

import { createAdminClient } from "@/lib/supabase/server";

export async function submitRenewalResponseAction(input: {
  token: string;
  wantsRenewal: boolean;
  availableFrom?: string | null;
  availableTo?: string | null;
  reason?: string | null;
  appreciation?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: rowRaw } = await admin
    .from("cdd_renewal_responses")
    .select("id, employee_id, responded_at")
    .eq("token", input.token)
    .maybeSingle();
  const row = rowRaw as { id: string; employee_id: string; responded_at: string | null } | null;
  if (!row) return { ok: false, error: "Lien invalide ou expiré." };
  if (row.responded_at) return { ok: false, error: "Tu as déjà répondu. Merci !" };

  const { error } = await admin
    .from("cdd_renewal_responses")
    .update({
      wants_renewal: input.wantsRenewal,
      available_from: input.wantsRenewal ? input.availableFrom || null : null,
      available_to: input.wantsRenewal ? input.availableTo || null : null,
      reason: input.reason?.trim() || null,
      appreciation: input.appreciation?.trim() || null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) return { ok: false, error: error.message };

  // Notifie RH/admin de la réponse (décision finale de renouvellement = humaine).
  try {
    const { data: emp } = await admin.from("employees").select("full_name").eq("id", row.employee_id).maybeSingle();
    const name = (emp as { full_name?: string } | null)?.full_name ?? "Un employé";
    const { data: rh } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
    const inserts = ((rh ?? []) as Array<{ id: string }>).map((p) => ({
      recipient_id: p.id,
      kind: "reminder" as const,
      title: `Renouvellement — ${name} a répondu : ${input.wantsRenewal ? "OUI ✅" : "NON"}`,
      body: input.wantsRenewal
        ? `Souhaite être renouvelé·e${input.availableFrom ? ` (dispo dès ${input.availableFrom})` : ""}. À examiner.`
        : "Ne souhaite pas être renouvelé·e.",
      link: "/admin/cdd-renewals",
      data: { employee_id: row.employee_id, wants_renewal: input.wantsRenewal },
    }));
    if (inserts.length > 0) await admin.from("notifications").insert(inserts);
  } catch {
    /* notif best-effort */
  }
  return { ok: true };
}
