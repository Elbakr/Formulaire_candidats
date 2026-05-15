// Score de fiabilite post-validation : un employe qui valide son planning
// puis annule un jour penalise son score. Karim 15/05/2026 : "Les jours
// manques ou annules par les travailleurs apres validation font descendre
// le score du travailleur."
//
// Calcule TS-side a partir de planning_validation_responses. Affichage
// dans /scoring a cote de la metrique ponctualite.

import { createClient } from "@/lib/supabase/server";

export type ValidationReliability = {
  employee_id: string;
  /** Nb de validations acceptees sur la periode */
  accepted: number;
  /** Nb d annulations apres validation acceptee */
  cancelled_after_validation: number;
  /** Nb de refus directs (au moment de la demande) */
  refused: number;
  /** % de validations honorees = accepted / (accepted + cancelled) */
  honored_pct: number;
  /** Score 0-100 : 100 - penalite. Penalite = cancelled_pct * 50 + refused_pct * 5 */
  score: number;
  band: "exemplary" | "ok" | "attention" | "danger";
};

function bandFor(score: number): ValidationReliability["band"] {
  if (score >= 95) return "exemplary";
  if (score >= 80) return "ok";
  if (score >= 60) return "attention";
  return "danger";
}

export async function loadValidationReliabilityForEmployees(
  employeeIds: string[],
  monthsBack: number = 6,
): Promise<Map<string, ValidationReliability>> {
  const result = new Map<string, ValidationReliability>();
  if (employeeIds.length === 0) return result;

  const supabase = await createClient();
  const since = new Date(Date.now() - monthsBack * 30 * 86_400_000).toISOString();

  const { data: rawResps } = await supabase
    .from("planning_validation_responses")
    .select(
      "employee_id, response, cancelled_after_validation, validated_at, refused_at",
    )
    .in("employee_id", employeeIds)
    .or(`validated_at.gte.${since},refused_at.gte.${since}`);

  const resps = (rawResps ?? []) as Array<{
    employee_id: string;
    response: string | null;
    cancelled_after_validation: boolean;
    validated_at: string | null;
    refused_at: string | null;
  }>;

  type Agg = { accepted: number; refused: number; cancelled: number };
  const aggByEmp = new Map<string, Agg>();
  for (const r of resps) {
    const a = aggByEmp.get(r.employee_id) ?? { accepted: 0, refused: 0, cancelled: 0 };
    if (r.cancelled_after_validation) a.cancelled += 1;
    else if (r.response === "accepted") a.accepted += 1;
    else if (r.response === "refused") a.refused += 1;
    aggByEmp.set(r.employee_id, a);
  }

  for (const id of employeeIds) {
    const a = aggByEmp.get(id);
    if (!a || a.accepted + a.refused + a.cancelled === 0) {
      result.set(id, {
        employee_id: id,
        accepted: 0,
        cancelled_after_validation: 0,
        refused: 0,
        honored_pct: 100,
        score: 100,
        band: "ok",
      });
      continue;
    }
    const totalValidated = a.accepted + a.cancelled;
    const totalResponded = a.accepted + a.cancelled + a.refused;
    const honoredPct = totalValidated > 0 ? (a.accepted / totalValidated) * 100 : 100;
    const cancelledPct = totalValidated > 0 ? (a.cancelled / totalValidated) * 100 : 0;
    const refusedPct = totalResponded > 0 ? (a.refused / totalResponded) * 100 : 0;
    // Penalite : annulation apres validation pese tres lourd (parole donnee).
    // Refus direct pese leger (transparence).
    const penalty = cancelledPct * 0.5 + refusedPct * 0.05;
    const score = Math.max(0, Math.min(100, 100 - penalty));
    result.set(id, {
      employee_id: id,
      accepted: a.accepted,
      cancelled_after_validation: a.cancelled,
      refused: a.refused,
      honored_pct: honoredPct,
      score,
      band: bandFor(score),
    });
  }
  return result;
}
