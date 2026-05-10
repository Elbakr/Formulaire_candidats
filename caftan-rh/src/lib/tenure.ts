// Helpers d'ancienneté + niveau implicite (junior/senior/lead).
// Repris de l'ancien `planning-employes.html` (getAnciennete + auto-promo).

export function monthsSince(dateISO: string | null | undefined): number {
  if (!dateISO) return 0;
  const start = new Date(dateISO);
  if (isNaN(start.getTime())) return 0;
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  // ajuste si le jour du mois en cours n'est pas atteint
  return now.getDate() < start.getDate() ? Math.max(0, months - 1) : months;
}

export function tenureLabel(dateISO: string | null | undefined): string {
  const m = monthsSince(dateISO);
  if (m <= 0) return "moins d'1 mois";
  if (m < 12) return `${m} mois`;
  const y = Math.floor(m / 12);
  const r = m % 12;
  if (r === 0) return `${y} an${y > 1 ? "s" : ""}`;
  return `${y} an${y > 1 ? "s" : ""} ${r} mois`;
}

export type SeniorTier = "junior" | "confirme" | "senior" | "lead";

/**
 * Niveau implicite basé sur ancienneté + type de contrat.
 *
 * Repris des règles métier de l'ancien planning :
 *   < 6 mois        → junior
 *   6-11 mois       → confirmé
 *   12-35 mois CDI  → senior
 *   ≥ 36 mois CDI   → lead
 *
 * Les CDD/étudiants restent "confirmé" max sauf > 24 mois.
 */
export function seniorTier(
  startDate: string | null | undefined,
  contractType: string | null | undefined,
): SeniorTier {
  const m = monthsSince(startDate);
  const ctype = (contractType ?? "").toLowerCase();
  const isPermanent = ctype.includes("cdi") || ctype.includes("indéterminée");

  if (m < 6) return "junior";
  if (m < 12) return "confirme";
  if (!isPermanent) {
    // CDD / intérim / étudiant
    return m >= 24 ? "senior" : "confirme";
  }
  // CDI
  if (m >= 36) return "lead";
  return "senior";
}

export function seniorTierLabel(t: SeniorTier): string {
  switch (t) {
    case "junior":
      return "Junior";
    case "confirme":
      return "Confirmé";
    case "senior":
      return "Senior";
    case "lead":
      return "Lead";
  }
}

/** Date du prochain anniversaire d'ancienneté (1 an, 2 ans, ...). */
export function nextAnniversary(
  startDate: string | null | undefined,
): { date: Date; years: number } | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let candidate = new Date(start);
  candidate.setFullYear(start.getFullYear() + years);
  if (candidate < now) {
    years += 1;
    candidate = new Date(start);
    candidate.setFullYear(start.getFullYear() + years);
  }
  return { date: candidate, years: Math.max(1, years) };
}

/** Période d'essai standard (3 mois) — date de fin estimée. */
export function trialEndDate(startDate: string | null | undefined): Date | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (isNaN(d.getTime())) return null;
  const out = new Date(d);
  out.setMonth(out.getMonth() + 3);
  return out;
}
