// Heuristique simple de scoring candidat (0-100).
// Critères pondérés : complétude dossier, dispos, langues, présence CV.

export type CandidateScored = {
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  city?: string | null;
  address?: string | null;
  postal_code?: string | null;
  nrn?: string | null;
  iban?: string | null;
  motivation?: string | null;
  available_from?: string | null;
  wanted_contract_type?: string | null;
  langs?: Record<string, string> | null;
  raw_payload?: Record<string, unknown> | null;
};

export function computeCandidateScore(c: CandidateScored): number {
  let score = 0;

  // Complétude (40 pts)
  const completenessFields: (keyof CandidateScored)[] = [
    "email", "phone", "birth_date", "city", "address", "postal_code", "nrn", "iban",
  ];
  const filled = completenessFields.filter((f) => !!(c[f] as unknown as string)?.toString().trim()).length;
  score += Math.round((filled / completenessFields.length) * 40);

  // Motivation (10 pts)
  const motivLen = (c.motivation ?? "").length;
  if (motivLen > 50) score += 10;
  else if (motivLen > 0) score += 5;

  // Dispo : si available_from set + wanted_contract_type → 15 pts
  if (c.available_from) score += 8;
  if (c.wanted_contract_type) score += 7;

  // Langues (15 pts max — 5 par langue de niveau Courant ou Maternelle, max 3)
  const langs = c.langs ?? {};
  const goodLangs = Object.values(langs).filter((v) => /courant|maternelle/i.test(String(v))).length;
  score += Math.min(15, goodLangs * 5);

  // CV (raw_payload contient cv_url ou source url) (10 pts)
  const raw = c.raw_payload as { cv_url?: string } | null;
  if (raw?.cv_url) score += 10;

  // Cap
  return Math.max(0, Math.min(100, score));
}

export function scoreLabel(score: number): { label: string; cls: string } {
  if (score >= 75) return { label: "Très bon", cls: "bg-success-light text-success" };
  if (score >= 55) return { label: "Bon", cls: "bg-gold-light text-gold-dark" };
  if (score >= 35) return { label: "Moyen", cls: "bg-warn-light text-warn" };
  return { label: "Faible", cls: "bg-danger-light text-danger" };
}
