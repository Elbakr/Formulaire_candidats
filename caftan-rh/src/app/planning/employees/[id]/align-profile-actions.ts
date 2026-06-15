"use server";

// Karim 2026-06-15 : action autonome "Aligner la fiche sur le contrat".
// Contrairement au bloc 3c de sign-contract-actions.ts (qui aligne EN PASSANT
// lors de l'envoi à signer), cette action est déclenchée directement depuis
// l'encart "Cohérence fiche ↔ contrat" sur la fiche employé admin.
//
// PRINCIPE : l'opérateur DÉCIDE. Il voit les discordances, ajuste les valeurs
// dans les inputs du card si besoin, puis valide. Cette action écrit uniquement
// ce que l'opérateur a explicitement confirmé (overrides > valeurs du contrat).

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveContractRenderInputs } from "@/lib/contract-render-inputs";

/**
 * Aligne la table `employees` sur les valeurs du dernier contrat préparé,
 * en appliquant les `overrides` de l'opérateur si fournis (ils priment sur
 * la valeur du contrat champ par champ).
 *
 * @param employeeId  - ID de l'employé à aligner
 * @param overrides   - Valeurs ajustées par l'opérateur (clé = field name)
 *                      Ex: { weekly_hours: "24", work_time_kind: "partial" }
 */
export async function alignProfileToContractAction(
  employeeId: string,
  overrides: Record<string, string>,
): Promise<{ ok: true } | { error: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  if (!employeeId) return { error: "Employé manquant." };

  const admin = createAdminClient();

  // Recharge les discordances via la source de vérité unique.
  const inputs = await resolveContractRenderInputs(admin, employeeId);
  if (!inputs.ok) return { error: inputs.error };

  const { discrepancies, eff, effTpl } = inputs;
  if (discrepancies.length === 0) return { ok: true }; // rien à aligner

  // Pour chaque discordance : valeur appliquée = override opérateur si fourni,
  // sinon valeur effective du contrat (déjà résolue dans `eff`).
  const pick = (field: string, contractFallback: unknown): string =>
    overrides[field] !== undefined ? overrides[field] : String(contractFallback ?? "");

  const patch: Record<string, unknown> = {};
  const changeLog: string[] = [];

  for (const d of discrepancies) {
    switch (d.field) {
      case "weekly_hours": {
        const raw = pick("weekly_hours", eff.weekly_hours);
        const hours = parseFloat(raw);
        if (!isNaN(hours) && hours > 0) {
          patch.weekly_hours = hours;
          // Dérive work_time_kind automatiquement depuis les heures finales,
          // sauf si l'opérateur a explicitement surchargé ce champ.
          if (overrides.work_time_kind === undefined) {
            patch.work_time_kind = hours < 38 ? "partial" : "full";
          }
          changeLog.push(`weekly_hours : ${d.profileValue} → ${raw}`);
        }
        break;
      }
      case "work_time_kind": {
        // Ne pas écraser la dérivation automatique déjà posée via weekly_hours
        // sauf si l'opérateur a fourni un override explicite.
        const raw = overrides.work_time_kind ?? (effTpl === "employee_pt" ? "partial" : "full");
        patch.work_time_kind = raw === "partial" || raw === "part" ? "partial" : "full";
        changeLog.push(`work_time_kind : ${d.profileValue} → ${patch.work_time_kind}`);
        break;
      }
      case "contract_type": {
        const raw = pick("contract_type", eff.contract_type);
        if (raw) { patch.contract_type = raw; changeLog.push(`contract_type : ${d.profileValue} → ${raw}`); }
        break;
      }
      case "job_title": {
        const raw = pick("job_title", eff.job_title);
        if (raw) { patch.job_title = raw; changeLog.push(`job_title : ${d.profileValue} → ${raw}`); }
        break;
      }
      case "hourly_rate": {
        const raw = pick("hourly_rate", eff.hourly_rate);
        const rate = parseFloat(raw);
        if (!isNaN(rate) && rate > 0) { patch.hourly_rate = rate; changeLog.push(`hourly_rate : ${d.profileValue} → ${raw}`); }
        break;
      }
      case "start_date": {
        const raw = pick("start_date", eff.start_date);
        if (raw) { patch.start_date = raw; changeLog.push(`start_date : ${d.profileValue} → ${raw}`); }
        break;
      }
      case "end_date": {
        const raw = pick("end_date", eff.end_date);
        patch.end_date = raw || null;
        changeLog.push(`end_date : ${d.profileValue} → ${raw || "(vide)"}`);
        break;
      }
    }
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const { error: updateErr } = await admin
    .from("employees")
    .update(patch)
    .eq("id", employeeId);
  if (updateErr) return { error: updateErr.message };

  // Log d'audit (non bloquant).
  try {
    await admin.from("activity_log").insert({
      profile_id: profile.id,
      action: "contract_profile_aligned",
      target_type: "employee",
      target_id: employeeId,
      body: `Fiche alignée sur le contrat (encart cohérence, décision opérateur). Changements : ${changeLog.join(" ; ")}.`,
    });
  } catch {
    /* non bloquant */
  }

  revalidatePath(`/planning/employees/${employeeId}`);
  return { ok: true };
}
