"use server";

// Karim 2026-06-15 : action "Corriger les paramètres du contrat avant envoi".
// Permet à l'opérateur, DEPUIS le popup d'envoi, de corriger directement les
// paramètres clés du contrat (régime, heures, dates, poste, taux) sans quitter
// le popup. L'UPDATE employees se fait AVANT l'envoi : resolveContractRenderInputs
// relit la fiche à la volée → cohérence garantie.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export type ContractTermsPatch = {
  contract_type?: string;
  work_time_kind?: string;
  weekly_hours?: number;
  start_date?: string;
  end_date?: string | null;
  job_title?: string;
  hourly_rate?: number;
};

/**
 * Enregistre les corrections de paramètres de contrat saisies par l'opérateur
 * dans le popup d'envoi, AVANT l'envoi à signer.
 *
 * Seuls les champs fournis et valides sont écrits (patch partiel).
 * Log l'action dans activity_log pour audit.
 */
export async function saveContractTermsAction(
  employeeId: string,
  patch: ContractTermsPatch,
): Promise<{ ok: true } | { error: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!employeeId) return { error: "Employé manquant." };

  // --- Validation ---
  const updatePayload: Record<string, unknown> = {};
  const changeLog: string[] = [];

  if (patch.contract_type !== undefined && patch.contract_type.trim() !== "") {
    updatePayload.contract_type = patch.contract_type.trim();
    changeLog.push(`contract_type → ${patch.contract_type.trim()}`);
  }

  if (patch.work_time_kind !== undefined && patch.work_time_kind.trim() !== "") {
    // Karim 2026-07-03 (audit) : la contrainte CHECK exige 'part'/'full'. On tolère
    // 'partial'/'partiel' en entrée mais on NORMALISE vers 'part' (sinon l'UPDATE
    // entier était rejeté -> impossible de corriger un contrat temps partiel).
    const raw = patch.work_time_kind.trim().toLowerCase();
    const wk = raw === "full" || raw === "plein" ? "full"
      : (raw === "part" || raw === "partial" || raw.includes("partiel")) ? "part"
      : null;
    if (!wk) {
      return { error: "work_time_kind doit être 'full' ou 'part'." };
    }
    updatePayload.work_time_kind = wk;
    changeLog.push(`work_time_kind → ${wk}`);
  }

  if (patch.weekly_hours !== undefined) {
    const h = Number(patch.weekly_hours);
    if (isNaN(h) || h < 0 || h > 50) {
      return { error: "Heures/semaine doivent être entre 0 et 50." };
    }
    updatePayload.weekly_hours = h;
    changeLog.push(`weekly_hours → ${h}`);
    // Si l'opérateur ne fournit pas work_time_kind explicitement, on dérive.
    if (patch.work_time_kind === undefined) {
      updatePayload.work_time_kind = h < 38 ? "part" : "full";
    }
  }

  if (patch.start_date !== undefined && patch.start_date.trim() !== "") {
    const d = patch.start_date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return { error: "start_date doit être au format YYYY-MM-DD." };
    }
    updatePayload.start_date = d;
    changeLog.push(`start_date → ${d}`);
  }

  // end_date : autorisé null/vide (contrat CDI ou sans terme fixé)
  if ("end_date" in patch) {
    if (patch.end_date === null || patch.end_date === undefined || patch.end_date === "") {
      updatePayload.end_date = null;
      changeLog.push("end_date → (vide)");
    } else {
      const d = patch.end_date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return { error: "end_date doit être au format YYYY-MM-DD ou vide." };
      }
      updatePayload.end_date = d;
      changeLog.push(`end_date → ${d}`);
    }
  }

  if (patch.job_title !== undefined && patch.job_title.trim() !== "") {
    updatePayload.job_title = patch.job_title.trim();
    changeLog.push(`job_title → ${patch.job_title.trim()}`);
  }

  if (patch.hourly_rate !== undefined) {
    const r = Number(patch.hourly_rate);
    if (isNaN(r) || r < 0) {
      return { error: "Taux horaire doit être >= 0." };
    }
    updatePayload.hourly_rate = r;
    changeLog.push(`hourly_rate → ${r}`);
  }

  if (Object.keys(updatePayload).length === 0) {
    // Rien à écrire — pas une erreur
    return { ok: true };
  }

  const admin = createAdminClient();

  const { error: updateErr } = await admin
    .from("employees")
    .update(updatePayload)
    .eq("id", employeeId);
  if (updateErr) return { error: updateErr.message };

  // Log d'audit (non bloquant)
  try {
    await admin.from("activity_log").insert({
      profile_id: profile.id,
      action: "contract_terms_edited",
      target_type: "employee",
      target_id: employeeId,
      body: `Paramètres contrat corrigés depuis le popup d'envoi. Changements : ${changeLog.join(" ; ")}.`,
    });
  } catch {
    /* non bloquant */
  }

  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true };
}
