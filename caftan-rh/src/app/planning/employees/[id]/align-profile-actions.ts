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

  // Karim 2026-06-17 : la colonne employees.work_time_kind a une contrainte
  // CHECK (work_time_kind in ('full','part')). Écrire 'partial' = violation =
  // UPDATE rejeté (= le « warning rouge » constaté). On normalise donc TOUTE
  // valeur entrante vers la convention 'part'/'full'.
  const normKind = (v: unknown): "full" | "part" | null => {
    const s = String(v ?? "").toLowerCase().trim();
    if (s === "part" || s === "partial" || s.includes("partiel")) return "part";
    if (s === "full" || s.includes("plein")) return "full";
    return null;
  };

  const patch: Record<string, unknown> = {};
  const changeLog: string[] = [];

  for (const d of discrepancies) {
    switch (d.field) {
      case "weekly_hours": {
        const raw = pick("weekly_hours", eff.weekly_hours);
        const hours = parseFloat(raw);
        if (!isNaN(hours) && hours > 0) {
          patch.weekly_hours = hours;
          changeLog.push(`weekly_hours : ${d.profileValue} → ${raw}`);
        }
        break;
      }
      case "work_time_kind": {
        const raw = overrides.work_time_kind ?? (effTpl === "employee_pt" ? "part" : "full");
        patch.work_time_kind = normKind(raw) ?? (effTpl === "employee_pt" ? "part" : "full");
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

  // Karim 2026-06-17 : COHÉRENCE DURE. Les heures pilotent le régime — il
  // n'existe pas de « 24h temps plein ». Si on aligne les heures, le régime suit
  // d'office (< 38h ⇒ temps partiel), quoi qu'ait choisi l'opérateur. C'est aussi
  // ce qui évite que le trigger légal (full ⇒ force 38h) ne re-gonfle les heures.
  if (patch.weekly_hours != null) {
    const h = Number(patch.weekly_hours);
    if (!isNaN(h) && h > 0) {
      const coherent: "full" | "part" = h < 38 ? "part" : "full";
      if (patch.work_time_kind !== coherent) {
        patch.work_time_kind = coherent;
        changeLog.push(`work_time_kind (cohérence ${h}h) → ${coherent}`);
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
