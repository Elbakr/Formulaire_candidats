"use server";

// Karim 2026-07-12 : réponse à la prise de pouls (ressenti au travail). Public, token.
import { createAdminClient } from "@/lib/supabase/server";

export async function submitPoulsAction(
  token: string,
  feeling: number,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const t = (token ?? "").trim();
  if (t.length < 12) return { ok: false, error: "Lien invalide." };
  const f = Math.max(1, Math.min(5, Math.round(feeling)));
  const admin = createAdminClient();
  const { data } = await admin.from("training_sentiment").select("id, employee_id").eq("token", t).maybeSingle();
  const row = data as { id: string; employee_id: string } | null;
  if (!row) return { ok: false, error: "Lien invalide." };

  await admin
    .from("training_sentiment")
    .update({ answered_at: new Date().toISOString(), feeling: f, note: (note ?? "").trim().slice(0, 2000) || null })
    .eq("id", row.id);

  try {
    const { data: emp } = await admin.from("employees").select("full_name").eq("id", row.employee_id).maybeSingle();
    const name = (emp as { full_name: string | null } | null)?.full_name ?? "un travailleur";
    const { notifyRoles } = await import("@/lib/notify");
    await notifyRoles(["admin", "rh"], {
      kind: "training_sentiment",
      title: `Prise de pouls — ${name} : ${f}/5`,
      body: (note ?? "").trim().slice(0, 200) || `Ressenti ${f}/5.`,
      link: `/planning/employees/${row.employee_id}`,
      data: { employee_id: row.employee_id, feeling: f },
    });
  } catch {
    /* non bloquant */
  }
  return { ok: true };
}
