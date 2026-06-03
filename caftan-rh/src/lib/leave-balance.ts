// Karim 2026-06-03 : calcul des soldes congés payés Belgique.
//
// Règle générale :
// - Plein temps régime 5j/sem : 20 jours ouvrables/an
// - Prorata si embauche en cours d'année (jours travaillés / jours totaux)
// - Temps partiel : prorata heures (weekly_hours / 38)
// - Étudiants : pas de congés payés (job étudiant)
// - CDD/CDI : congés payés normaux
// - Carry-over rare en BE (perdus au 31/12 sauf accord)
// - Sectoriels CCT 201 : 1 jour supplémentaire selon ancienneté (à activer
//   manuellement via sector_extra)

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

const BASE_LEGAL_DAYS = 20.0;

export interface BalanceComputeInput {
  employee_id: string;
  full_name: string;
  contract_type: string | null;
  start_date: string | null;
  end_date: string | null;
  weekly_hours: number | null;
  status: string;
}

export interface BalanceComputed {
  employee_id: string;
  year: number;
  base_days: number;
  sector_extra: number;
  carry_over: number;
  prorata_factor: number;
  used_days: number;
  pending_days: number;
  note: string;
}

/**
 * Calcule le prorata pour un employé donné sur une année.
 * - Régime plein temps 38h/sem = 1.0
 * - Temps partiel 19h = 0.5
 * - Embauche en cours d'année = (jours restants / 365)
 * - Sortie en cours d'année = (jours travaillés / 365)
 */
function computeProrata(emp: BalanceComputeInput, year: number): { factor: number; note: string } {
  const yearStart = new Date(`${year}-01-01`);
  const yearEnd = new Date(`${year}-12-31`);
  const yearDays = 365;

  // 1. Facteur temps partiel
  const weeklyHours = emp.weekly_hours ?? 38;
  const timeFactor = Math.min(1, weeklyHours / 38);

  // 2. Facteur année (% de l'année travaillée)
  const empStart = emp.start_date ? new Date(emp.start_date) : yearStart;
  const empEnd = emp.end_date ? new Date(emp.end_date) : yearEnd;
  const effectiveStart = empStart > yearStart ? empStart : yearStart;
  const effectiveEnd = empEnd < yearEnd ? empEnd : yearEnd;
  if (effectiveEnd < effectiveStart) {
    return { factor: 0, note: "Hors période contrat" };
  }
  const workedDays = Math.max(0, Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (24 * 3600 * 1000)));
  const yearFactor = workedDays / yearDays;

  const factor = Math.min(1, timeFactor * yearFactor);
  const note = `Prorata ${(factor * 100).toFixed(0)}% (temps=${(timeFactor * 100).toFixed(0)}% × année=${(yearFactor * 100).toFixed(0)}%)`;
  return { factor, note };
}

export async function computeBalanceForEmployee(
  emp: BalanceComputeInput,
  year: number,
): Promise<BalanceComputed | null> {
  if (emp.contract_type === "Étudiant" || emp.contract_type === "Student") {
    return null; // pas de congés payés pour les étudiants
  }
  const { factor, note } = computeProrata(emp, year);
  if (factor <= 0) return null;

  const admin = createAdminClient();

  // Used + pending depuis time_off_requests
  const { data: requests } = await admin
    .from("time_off_requests")
    .select("status, start_date, end_date, kind")
    .eq("employee_id", emp.employee_id)
    .gte("start_date", `${year}-01-01`)
    .lte("end_date", `${year}-12-31`)
    .in("kind", ["paid_leave", "conge_paye", "annual_leave", "leave"]);

  let used = 0;
  let pending = 0;
  for (const r of (requests ?? []) as Array<{ status: string; start_date: string; end_date: string }>) {
    const start = new Date(r.start_date);
    const end = new Date(r.end_date);
    const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (24 * 3600 * 1000))) + 1;
    if (r.status === "approved" || r.status === "accepted") used += days;
    else if (r.status === "pending" || r.status === "submitted") pending += days;
  }

  return {
    employee_id: emp.employee_id,
    year,
    base_days: BASE_LEGAL_DAYS,
    sector_extra: 0,
    carry_over: 0,
    prorata_factor: Number(factor.toFixed(4)),
    used_days: Number(used.toFixed(2)),
    pending_days: Number(pending.toFixed(2)),
    note,
  };
}

/**
 * Met à jour ou crée le balance pour un employé+année.
 */
export async function upsertBalance(balance: BalanceComputed): Promise<void> {
  const admin = createAdminClient();
  await admin.from("leave_balances").upsert(
    {
      employee_id: balance.employee_id,
      year: balance.year,
      base_days: balance.base_days,
      sector_extra: balance.sector_extra,
      carry_over: balance.carry_over,
      prorata_factor: balance.prorata_factor,
      used_days: balance.used_days,
      pending_days: balance.pending_days,
      computation_note: balance.note,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,year" },
  );
}

/**
 * Recompute tous les balances pour l'année courante (cron + manuel).
 */
export async function recomputeAllBalances(year: number): Promise<{ updated: number; skipped: number; errors: number }> {
  const admin = createAdminClient();
  const { data: employees } = await admin
    .from("employees")
    .select("id, full_name, contract_type, start_date, end_date, weekly_hours, status")
    .in("status", ["active", "on_leave", "archived"]);
  let updated = 0, skipped = 0, errors = 0;
  for (const emp of (employees ?? []) as BalanceComputeInput[]) {
    try {
      const b = await computeBalanceForEmployee(emp, year);
      if (!b) { skipped++; continue; }
      await upsertBalance(b);
      updated++;
    } catch (e) {
      console.warn("[leave-balance] err", emp.full_name, (e as Error).message);
      errors++;
    }
  }
  return { updated, skipped, errors };
}
