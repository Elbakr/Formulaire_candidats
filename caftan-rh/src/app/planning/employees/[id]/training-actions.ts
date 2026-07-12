"use server";

// Karim 2026-07-12 : démarre (ou renvoie la section courante de) le programme de
// formation d'un travailleur. Envoi manuel côté admin ; ensuite le cron enchaîne à 9h.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureEnrollment, sendTrainingModule } from "@/lib/training/drip";
import { getNeutralBaseUrl } from "@/lib/public-base-url";
import { revalidatePath } from "next/cache";

export async function startTrainingAction(
  employeeId: string,
): Promise<{ ok: boolean; error?: string; link?: string }> {
  await requireRole(["admin", "rh"]);
  if (!employeeId) return { ok: false, error: "Travailleur manquant." };
  const admin = createAdminClient();
  const enr = await ensureEnrollment(admin, employeeId);
  if (!enr) return { ok: false, error: "Inscription impossible." };

  // Envoie la section à venir : 1 si pas encore commencé, sinon la suivante.
  const seqToSend = enr.current_seq === 0 ? 1 : enr.current_seq + 1;
  const r = await sendTrainingModule(admin, employeeId, seqToSend);
  if (!r.ok && !r.done) return { ok: false, error: r.error ?? "Envoi impossible." };
  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true, link: `${getNeutralBaseUrl()}/former/${enr.token}` };
}
