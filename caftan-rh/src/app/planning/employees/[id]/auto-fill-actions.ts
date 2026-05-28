"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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

/**
 * Karim 2026-05-22 : boucher contractuel pour TOUS les employes actifs d un
 * site donne. Boucle sur chaque membre, appelle autoFillEmployeeContractual
 * en parallele. Retourne un resume agrege.
 */
export async function autoFillSiteAllEmployeesContractualAction(args: {
  siteId: string;
  weekISO: string;
}): Promise<{
  ok?: boolean;
  error?: string;
  per_employee: Array<{
    employee_id: string;
    full_name: string;
    created: number;
    reclassified: number;
    ot_pending: number;
    error?: string;
  }>;
  total_created: number;
  total_reclassified: number;
  total_ot_pending: number;
}> {
  await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();
  const todayISO = new Date().toISOString().slice(0, 10);

  // 1. Liste des employes actifs du site (2 queries pour eviter bug jointure)
  const { data: assignsRaw } = await supabase
    .from("site_assignments")
    .select("employee_id")
    .eq("site_id", args.siteId)
    .lte("start_date", todayISO)
    .or(`end_date.is.null,end_date.gte.${todayISO}`);
  const empIds = [
    ...new Set(
      ((assignsRaw ?? []) as Array<{ employee_id: string }>).map((a) => a.employee_id),
    ),
  ];
  if (empIds.length === 0) {
    return {
      error: "Aucun employe actif sur ce site.",
      per_employee: [],
      total_created: 0,
      total_reclassified: 0,
      total_ot_pending: 0,
    };
  }
  const { data: empsRaw } = await supabase
    .from("employees")
    .select("id, full_name")
    .in("id", empIds)
    .eq("status", "active");
  const employees = (empsRaw ?? []) as Array<{ id: string; full_name: string }>;

  // 2. Lance le boucher contractuel en parallele
  const results = await Promise.all(
    employees.map(async (emp) => {
      try {
        const r = await autoFillEmployeeContractualAction({
          employeeId: emp.id,
          weekISO: args.weekISO,
        });
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          created: r.created ?? 0,
          reclassified: r.reclassified ?? 0,
          ot_pending: r.ot_pending ?? 0,
          error: r.error,
        };
      } catch (err) {
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          created: 0,
          reclassified: 0,
          ot_pending: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return {
    ok: true,
    per_employee: results,
    total_created: results.reduce((a, r) => a + r.created, 0),
    total_reclassified: results.reduce((a, r) => a + r.reclassified, 0),
    total_ot_pending: results.reduce((a, r) => a + r.ot_pending, 0),
  };
}
