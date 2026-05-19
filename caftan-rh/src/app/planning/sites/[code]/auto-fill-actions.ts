"use server";

import { requireRole } from "@/lib/auth";
import {
  previewSitePlanAction,
  commitSitePlanAction,
  proposeOvertimeCandidatesAction,
  commitIndividualOvertimeAction,
} from "./actions";

/**
 * Karim 19/05 : bouton "🚀 Boucher les créneaux manquants".
 *
 * PHASE 1 (1er clic) : utilise le reservoir contractuel des employes.
 * Genere previewSitePlanAction (= tous les drafts contractuels possibles
 * en respectant les quotas hebdo) puis commit directement sans dialog.
 *
 * Retourne created + uncovered restants pour informer le RH si une
 * deuxieme passe OT est necessaire.
 */
export async function autoFillSiteContractualAction(args: {
  siteCode: string;
  weekISO: string;
}): Promise<{
  ok?: boolean;
  error?: string;
  created?: number;
  uncovered_count?: number;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const preview = await previewSitePlanAction(args.siteCode, args.weekISO);
  if ("error" in preview) return { error: preview.error };
  const uncoveredCount = (preview.uncovered ?? []).reduce(
    (acc, u) => acc + u.missing,
    0,
  );
  if (preview.drafts.length === 0) {
    return {
      ok: true,
      created: 0,
      uncovered_count: uncoveredCount,
    };
  }
  const commit = await commitSitePlanAction(preview.drafts);
  if (commit.error) return { error: commit.error };
  return {
    ok: true,
    created: commit.created ?? 0,
    uncovered_count: uncoveredCount,
  };
}

/**
 * PHASE 2 (2e clic, libelle "Reservoir d heures sup") : auto-pick le 1er
 * candidat eligible OT pour chaque slot encore uncovered, avec le multiplier
 * minimum requis (le moins cher pour le candidat). Commit en bulk.
 */
export async function autoFillSiteOvertimeAction(args: {
  siteCode: string;
  weekISO: string;
}): Promise<{
  ok?: boolean;
  error?: string;
  ot_created?: number;
  ot_hours_total?: number;
  unfilled_count?: number;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const preview = await previewSitePlanAction(args.siteCode, args.weekISO);
  if ("error" in preview) return { error: preview.error };

  const proposed = await proposeOvertimeCandidatesAction({
    siteCode: args.siteCode,
    weekISO: args.weekISO,
    baseDrafts: preview.drafts,
  });
  if ("error" in proposed) return { error: proposed.error };

  // Auto-pick : pour chaque slot, prend les N premiers candidats AVAILABLE
  // (jusqu a slot.missing). Choix du multiplier = min_multiplier_required
  // (le moins genereux possible cote business).
  const authorizations: Array<{
    need_id: string;
    employee_id: string;
    start_time: string;
    end_time: string;
    overtime_multiplier: 1.0 | 1.25 | 1.5 | 2.0;
  }> = [];
  let unfilledCount = 0;
  let otHoursTotal = 0;
  for (const slot of proposed.slots) {
    const available = slot.candidates.filter((c) => c.available_for_this_slot);
    const picked = available.slice(0, slot.missing);
    if (picked.length < slot.missing) {
      unfilledCount += slot.missing - picked.length;
    }
    for (const cand of picked) {
      const mult = (cand.min_multiplier_required ?? 1.5) as
        | 1.0
        | 1.25
        | 1.5
        | 2.0;
      authorizations.push({
        need_id: slot.need_id,
        employee_id: cand.employee_id,
        start_time: cand.effective_start_time,
        end_time: cand.effective_end_time,
        overtime_multiplier: mult,
      });
      otHoursTotal += cand.overtime_hours;
    }
  }

  if (authorizations.length === 0) {
    return {
      ok: true,
      ot_created: 0,
      ot_hours_total: 0,
      unfilled_count: unfilledCount,
    };
  }

  const commit = await commitIndividualOvertimeAction({
    siteCode: args.siteCode,
    weekISO: args.weekISO,
    authorizations,
  });
  if (commit.error) return { error: commit.error };

  return {
    ok: true,
    ot_created: commit.created ?? 0,
    ot_hours_total: otHoursTotal,
    unfilled_count: unfilledCount,
  };
}
