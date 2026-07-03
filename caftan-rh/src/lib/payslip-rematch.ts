// Karim 2026-07-03 : re-matching des fiches de paie ORPHELINES (employee_id NULL)
// + réparation des classements principale/secondaire.
//
// Contexte : l'import ne matchait que les employés actifs → les fiches des ex-
// employés (archivés) partaient orphelines. On re-matche via payment_holder_name
// (matcher token-set existant, ordre NOM/Prénom géré).
//
// PRUDENCE (argent) :
//  - jamais de faux match ;
//  - ne PAS classer une fiche en "secondaire" à partir d'un DOUBLON (même montant
//    qu'une fiche existante) — sinon on crée un faux couple qui, une fois le
//    doublon supprimé, laisse une "secondaire isolée" dont l'avance est forcée à 0 ;
//  - réparer les secondaires isolées existantes (→ principale + recalcul avance).

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { matchEmployee, type EmployeeBd } from "@/lib/payslip-splitter";

export interface RematchResult {
  scanned: number;
  rematched: number;
  duplicates_skipped: number;
  still_orphan: number;
  conflicts: number;
  repaired_secondaries: number;
  details: string[];
}

const EPS = 0.01;

export async function rematchOrphanPayslips(): Promise<RematchResult> {
  const admin = createAdminClient();
  const res: RematchResult = {
    scanned: 0, rematched: 0, duplicates_skipped: 0, still_orphan: 0, conflicts: 0, repaired_secondaries: 0, details: [],
  };

  // TOUS les employés (actifs + archivés), avec l'avance en cours.
  const { data: emps } = await admin.from("employees").select("id, full_name, nrn, salary_advance_amount");
  const employees = (emps ?? []) as Array<EmployeeBd & { salary_advance_amount: number | null }>;
  const advanceById = new Map(employees.map((e) => [e.id, Number(e.salary_advance_amount ?? 0)]));
  const { recomputePayslipAdvance } = await import("@/app/admin/payslips/actions");

  const { data: orphansRaw } = await admin
    .from("payslips")
    .select("id, period_year, period_month, is_secondary, payment_holder_name, amount_to_pay, net_amount")
    .is("employee_id", null)
    .order("amount_to_pay", { ascending: false });
  const orphans = (orphansRaw ?? []) as Array<{
    id: string; period_year: number; period_month: number; is_secondary: boolean;
    payment_holder_name: string | null; amount_to_pay: number | null; net_amount: number | null;
  }>;
  res.scanned = orphans.length;

  for (const o of orphans) {
    const name = (o.payment_holder_name ?? "").trim() || null;
    if (!name) { res.still_orphan++; continue; }
    const matched = matchEmployee(name, null, employees);
    if (!matched) { res.still_orphan++; continue; }

    // Fiches existantes de l'employé pour ce mois.
    const { data: existingRaw } = await admin
      .from("payslips")
      .select("is_secondary, amount_to_pay, net_amount")
      .eq("employee_id", matched.id)
      .eq("period_year", o.period_year)
      .eq("period_month", o.period_month);
    const existing = (existingRaw ?? []) as Array<{ is_secondary: boolean; amount_to_pay: number | null; net_amount: number | null }>;

    // DOUBLON : même montant qu'une fiche déjà présente → on n'associe pas (on
    // laisse orphelin pour suppression manuelle), sinon on créerait un faux couple.
    const oAmt = Number(o.amount_to_pay ?? o.net_amount ?? 0);
    const isDuplicate = existing.some((e) => Math.abs(Number(e.amount_to_pay ?? e.net_amount ?? 0) - oAmt) < EPS);
    if (isDuplicate) {
      res.duplicates_skipped++;
      res.details.push(`${name} — ${o.period_month}/${o.period_year} : doublon (${oAmt.toFixed(2)} €), laissé orphelin`);
      continue;
    }

    const takenPrimary = existing.some((e) => e.is_secondary === false);
    const takenSecondary = existing.some((e) => e.is_secondary === true);
    let isSecondary: boolean;
    if (!takenPrimary) isSecondary = false;
    else if (!takenSecondary) isSecondary = true;
    else { res.conflicts++; res.details.push(`${name} — ${o.period_month}/${o.period_year} : déjà 2 fiches, laissée orpheline`); continue; }

    const { error } = await admin.from("payslips").update({ employee_id: matched.id, is_secondary: isSecondary }).eq("id", o.id);
    if (error) { res.still_orphan++; res.details.push(`${name} : échec (${error.message})`); continue; }
    // Karim 2026-07-03 : après association, RECALCULE amount_to_pay (net - avance)
    // + REGÉNÈRE le QR (comme le fait l'association manuelle). Sans ça la fiche
    // rattachée gardait net brut et aucun QR.
    try {
      await recomputePayslipAdvance(admin, o.id, advanceById.get(matched.id) ?? 0);
    } catch { /* best-effort */ }
    res.rematched++;
    res.details.push(`${name} → ${matched.full_name} (${o.period_month}/${o.period_year}, ${isSecondary ? "secondaire" : "principale"})`);
  }

  // Répare les secondaires isolées (avance forcée à 0 par erreur).
  const rep = await repairLoneSecondaries();
  res.repaired_secondaries = rep.repaired;
  res.details.push(...rep.details);

  return res;
}

/**
 * Répare les fiches marquées is_secondary=true SANS principale pour le même
 * (employé, mois) : elles sont en réalité la principale → on les repromeut et on
 * recalcule l'avance (une secondaire force l'avance à 0, ce qui cassait la
 * déduction d'avance — régression du re-matching).
 */
export async function repairLoneSecondaries(): Promise<{ repaired: number; details: string[] }> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("payslips")
    .select("id, employee_id, period_year, period_month, is_secondary, amount_to_pay, net_amount")
    .not("employee_id", "is", null);
  const groups = new Map<string, Array<{ id: string; employee_id: string; is_secondary: boolean; amount_to_pay: number | null; net_amount: number | null }>>();
  for (const r of (rows ?? []) as Array<{ id: string; employee_id: string; period_year: number; period_month: number; is_secondary: boolean; amount_to_pay: number | null; net_amount: number | null }>) {
    const k = `${r.employee_id}|${r.period_year}|${r.period_month}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  let repaired = 0;
  const details: string[] = [];
  const { recomputePayslipAdvance } = await import("@/app/admin/payslips/actions");

  for (const g of groups.values()) {
    const hasPrimary = g.some((x) => x.is_secondary === false);
    if (hasPrimary || g.length === 0) continue; // rien à réparer
    // Toutes secondaires → on promeut la plus grosse en principale.
    const primary = [...g].sort((a, b) => Number(b.amount_to_pay ?? b.net_amount ?? 0) - Number(a.amount_to_pay ?? a.net_amount ?? 0))[0];
    await admin.from("payslips").update({ is_secondary: false }).eq("id", primary.id);
    // Recalcule l'avance (applique l'avance en cours de l'employé + régénère QR).
    try {
      const { data: emp } = await admin.from("employees").select("salary_advance_amount").eq("id", primary.employee_id).single();
      await recomputePayslipAdvance(admin, primary.id, Number((emp as { salary_advance_amount?: number } | null)?.salary_advance_amount ?? 0));
    } catch { /* best-effort */ }
    repaired++;
    details.push(`Réparé : fiche ${primary.id.slice(0, 8)} → principale + avance recalculée`);
  }
  return { repaired, details };
}
