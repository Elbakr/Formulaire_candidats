"use server";

import { requireRole } from "@/lib/auth";
import { generateEmployeeWeekPlanAction, commitEmployeeWeekPlanAction } from "./generate-actions";

/**
 * Karim 19/05 : 2-phases sur la fiche employe.
 *
 * PHASE 1 'Boucher contractuel' : commit drafts (nouveaux shifts contractuels)
 * + reclassifications (OT existants -> contractuel pour vider le reservoir
 * contractuel d abord). N inclut PAS les ot_proposals (heures sup neuves).
 */
export async function autoFillEmployeeContractualAction(args: {
  employeeId: string;
  weekISO: string;
}): Promise<{
  ok?: boolean;
  error?: string;
  created?: number;
  reclassified?: number;
  ot_pending?: number;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const r = await generateEmployeeWeekPlanAction({
    employeeId: args.employeeId,
    weekISO: args.weekISO,
  });
  if (r.error) return { error: r.error };
  const preview = r.preview;
  if (!preview) return { error: "Preview manquant." };

  const reclassifyIds = (preview.reclassifications ?? []).map((x) => x.shift_id);
  if (preview.drafts.length === 0 && reclassifyIds.length === 0) {
    return {
      ok: true,
      created: 0,
      reclassified: 0,
      ot_pending: (preview.ot_proposals ?? []).length,
    };
  }
  const c = await commitEmployeeWeekPlanAction({
    employeeId: args.employeeId,
    drafts: preview.drafts,
    reclassifyShiftIds: reclassifyIds,
    // ne commit PAS les OT ici
    otProposals: [],
  });
  if (c.error) return { error: c.error };
  return {
    ok: true,
    created: c.created ?? 0,
    reclassified: c.reclassified ?? 0,
    ot_pending: (preview.ot_proposals ?? []).length,
  };
}

/**
 * PHASE 2 'Reservoir d heures sup' : commit UNIQUEMENT les ot_proposals
 * (nouveaux shifts OT pour combler les besoins site non couverts).
 */
export async function autoFillEmployeeOvertimeAction(args: {
  employeeId: string;
  weekISO: string;
}): Promise<{
  ok?: boolean;
  error?: string;
  ot_created?: number;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const r = await generateEmployeeWeekPlanAction({
    employeeId: args.employeeId,
    weekISO: args.weekISO,
  });
  if (r.error) return { error: r.error };
  const preview = r.preview;
  if (!preview) return { error: "Preview manquant." };

  const otProposals = preview.ot_proposals ?? [];
  if (otProposals.length === 0) {
    return { ok: true, ot_created: 0 };
  }
  const c = await commitEmployeeWeekPlanAction({
    employeeId: args.employeeId,
    drafts: [],
    reclassifyShiftIds: [],
    otProposals,
  });
  if (c.error) return { error: c.error };
  return { ok: true, ot_created: c.ot_created ?? 0 };
}
