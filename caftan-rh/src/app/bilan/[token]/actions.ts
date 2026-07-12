"use server";

// Karim 2026-07-12 : réponse au bilan de sortie (chaleureux). Public, token.
import { createAdminClient } from "@/lib/supabase/server";

export type BilanInput = {
  rating_training: number;
  rating_colleagues: number;
  rating_work: number;
  rating_salary: number;
  rating_schedule: number;
  free_text: string;
  available_again: boolean | null;
  wants_candidate: boolean | null;
  availability_note: string;
};

const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)));

export async function submitBilanAction(token: string, input: BilanInput): Promise<{ ok: boolean; error?: string }> {
  const t = (token ?? "").trim();
  if (t.length < 12) return { ok: false, error: "Lien invalide." };
  const admin = createAdminClient();
  const { data } = await admin.from("training_exit_survey").select("id, employee_id").eq("token", t).maybeSingle();
  const row = data as { id: string; employee_id: string } | null;
  if (!row) return { ok: false, error: "Lien invalide." };

  await admin
    .from("training_exit_survey")
    .update({
      submitted_at: new Date().toISOString(),
      rating_training: clamp(input.rating_training),
      rating_colleagues: clamp(input.rating_colleagues),
      rating_work: clamp(input.rating_work),
      rating_salary: clamp(input.rating_salary),
      rating_schedule: clamp(input.rating_schedule),
      free_text: (input.free_text ?? "").trim().slice(0, 4000) || null,
      available_again: input.available_again,
      wants_candidate: input.wants_candidate,
      availability_note: (input.availability_note ?? "").trim().slice(0, 2000) || null,
    })
    .eq("id", row.id);

  try {
    const { data: emp } = await admin.from("employees").select("full_name").eq("id", row.employee_id).maybeSingle();
    const name = (emp as { full_name: string | null } | null)?.full_name ?? "un travailleur";
    const dispo = input.available_again === true ? "dispo à l'avenir ✅" : input.available_again === false ? "pas dispo ❌" : "dispo ?";
    const cand = input.wants_candidate === true ? "souhaite rester candidat ✅" : input.wants_candidate === false ? "ne souhaite pas ❌" : "";
    const { notifyRoles } = await import("@/lib/notify");
    await notifyRoles(["admin", "rh"], {
      kind: "training_exit_survey",
      title: `Bilan de sortie — ${name}`,
      body: `${dispo}${cand ? " · " + cand : ""}. Formation ${clamp(input.rating_training)}/5, travail ${clamp(input.rating_work)}/5.`,
      link: `/planning/employees/${row.employee_id}`,
      data: { employee_id: row.employee_id, available_again: input.available_again, wants_candidate: input.wants_candidate },
    });
  } catch {
    /* non bloquant */
  }
  return { ok: true };
}
