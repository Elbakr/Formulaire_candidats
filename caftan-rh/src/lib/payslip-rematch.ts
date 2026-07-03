// Karim 2026-07-03 : re-matching des fiches de paie ORPHELINES (employee_id NULL).
//
// Cause des orphelines : l'extraction du NOM depuis certaines mises en page PDF
// échoue (ex. fiches de juin "SERGHINI Ilham" en NOM Prénom / tout majuscule),
// alors que `payment_holder_name` (lu sur la ligne "de <Nom>" de la formule de
// paiement) est bien stocké. On re-matche donc les orphelines via
// payment_holder_name + le matcher token-set existant (ordre NOM/Prénom géré).
//
// Prudence (argent) : matcher conservateur (tous les tokens OU ≥2 tokens communs
// non ambigus) ; jamais de faux match. Respecte l'unicité (employee, période,
// is_secondary) : si l'employé a déjà 2 fiches ce mois, on laisse orpheline.

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { matchEmployee, type EmployeeBd } from "@/lib/payslip-splitter";

export interface RematchResult {
  scanned: number;
  rematched: number;
  still_orphan: number;
  conflicts: number;
  details: string[];
}

export async function rematchOrphanPayslips(): Promise<RematchResult> {
  const admin = createAdminClient();

  // TOUS les employés (y compris archivés : une fiche orpheline peut appartenir
  // à un ex-employé).
  const { data: emps } = await admin.from("employees").select("id, full_name, nrn");
  const employees = (emps ?? []) as EmployeeBd[];

  const { data: orphansRaw } = await admin
    .from("payslips")
    .select("id, period_year, period_month, is_secondary, payment_holder_name, amount_to_pay")
    .is("employee_id", null)
    .order("amount_to_pay", { ascending: false }); // la plus grosse = principale
  const orphans = (orphansRaw ?? []) as Array<{
    id: string;
    period_year: number;
    period_month: number;
    is_secondary: boolean;
    payment_holder_name: string | null;
    amount_to_pay: number | null;
  }>;

  const res: RematchResult = { scanned: orphans.length, rematched: 0, still_orphan: 0, conflicts: 0, details: [] };

  for (const o of orphans) {
    const name = (o.payment_holder_name ?? "").trim() || null;
    if (!name) { res.still_orphan++; continue; }
    const matched = matchEmployee(name, null, employees);
    if (!matched) { res.still_orphan++; continue; }

    // Résout is_secondary pour respecter l'index unique
    // (employee_id, period_year, period_month, is_secondary).
    const { data: existing } = await admin
      .from("payslips")
      .select("is_secondary")
      .eq("employee_id", matched.id)
      .eq("period_year", o.period_year)
      .eq("period_month", o.period_month);
    const rows = (existing ?? []) as Array<{ is_secondary: boolean }>;
    const takenPrimary = rows.some((e) => e.is_secondary === false);
    const takenSecondary = rows.some((e) => e.is_secondary === true);
    let isSecondary: boolean;
    if (!takenPrimary) isSecondary = false;
    else if (!takenSecondary) isSecondary = true;
    else {
      res.conflicts++;
      res.details.push(`${name} — ${o.period_month}/${o.period_year} : déjà 2 fiches, laissée orpheline`);
      continue;
    }

    const { error } = await admin
      .from("payslips")
      .update({ employee_id: matched.id, is_secondary: isSecondary })
      .eq("id", o.id);
    if (error) {
      res.still_orphan++;
      res.details.push(`${name} : échec (${error.message})`);
      continue;
    }
    res.rematched++;
    res.details.push(`${name} → ${matched.full_name} (${o.period_month}/${o.period_year}, ${isSecondary ? "secondaire" : "principale"})`);
  }

  return res;
}
