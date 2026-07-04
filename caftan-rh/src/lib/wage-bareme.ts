import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Karim 2026-07-04 : résout le barème PLANCHER (défaut + minimum) pour un contrat.
// Aucune valeur légale codée en dur : tout vient de la table wage_baremes (éditable
// par Karim). Priorité : type de contrat exact + tranche d'âge > type exact plat >
// 'default' + âge > 'default' plat. Dégrade à null si aucune règle -> pas de plancher.

export type BaremeResult = { hourlyFloor: number | null; label: string | null; source: string; age: number | null };

export function ageFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const d = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

type Row = { contract_kind: string; age_min: number | null; age_max: number | null; hourly_rate: number; label: string | null };

export async function resolveWageBareme(
  admin: SupabaseClient,
  contractKind: string | null,
  birthDate: string | null,
): Promise<BaremeResult> {
  const age = ageFromBirthDate(birthDate);
  const { data } = await admin.from("wage_baremes").select("contract_kind, age_min, age_max, hourly_rate, label").eq("is_active", true);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { hourlyFloor: null, label: null, source: "aucun barème défini", age };

  const ageOk = (r: Row) => (r.age_min == null || (age != null && age >= r.age_min)) && (r.age_max == null || (age != null && age <= r.age_max));
  const scored = rows
    .filter(ageOk)
    .map((r) => {
      const kindScore = r.contract_kind === contractKind ? 2 : r.contract_kind === "default" ? 1 : 0;
      const ageScore = r.age_min != null || r.age_max != null ? 0.5 : 0;
      return { r, score: kindScore + ageScore };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.r.hourly_rate) - Number(a.r.hourly_rate));

  const best = scored[0]?.r;
  if (!best) return { hourlyFloor: null, label: null, source: "aucun barème applicable", age };
  return {
    hourlyFloor: Number(best.hourly_rate),
    label: best.label,
    source: `barème ${best.contract_kind}${age != null ? ` · âge ${age}` : ""}`,
    age,
  };
}
