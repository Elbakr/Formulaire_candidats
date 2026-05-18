/**
 * Score de matching candidat (0-100) sur 4 axes pondérés également :
 *  - Proximité géographique (25 pts)
 *  - Maîtrise des langues (25 pts)
 *  - Tranche d'âge (25 pts)
 *  - Fraîcheur de la candidature (25 pts)
 *
 * Décidé avec Karim 18/05 via AskUserQuestion. Caftan = retail boutique
 * multilingue (FR + AR clientèle) à Bruxelles. Donc :
 *  - Candidat sur Bruxelles élargi favorisé (proximité bouques)
 *  - FR + AR (au minimum) impératif, autres langues bonus
 *  - 25-35 ans = sweet spot (énergie + maturité retail)
 *  - Candidature récente = motivation actuelle, non perdue à un autre emploi
 */

export type CandidateForScoring = {
  city: string | null;
  birth_date: string | null;
  langs: Record<string, unknown> | null;
  applied_at: string | null;
};

export type ScoreBreakdown = {
  proximity: number;       // 0-25
  languages: number;       // 0-25
  age: number;             // 0-25
  freshness: number;       // 0-25
  city_label: string;
  age_value: number | null;
  langs_summary: string;
  days_since_applied: number | null;
};

// ─── Proximité ─────────────────────────────────────────────────────────────
// Mapping des communes belges par cluster de distance aux boutiques Caftan
// (Bruxelles + Anderlecht principalement). Liste non-exhaustive, complétée
// au fil de l'usage.

const BRUSSELS_CORE = new Set([
  "bruxelles", "brussel", "anderlecht", "molenbeek", "molenbeek-saint-jean",
  "koekelberg", "saint-gilles", "saint-josse", "saint-josse-ten-noode",
  "forest", "1000", "1070", "1080", "1081", "1060", "1190",
]);
const BRUSSELS_NEAR = new Set([
  "schaerbeek", "ixelles", "etterbeek", "jette", "laeken", "evere",
  "ganshoren", "uccle", "berchem-sainte-agathe", "neder-over-heembeek",
  "1030", "1050", "1040", "1090", "1140", "1083", "1180", "1082",
]);
const BRUSSELS_FAR = new Set([
  "auderghem", "watermael-boitsfort", "woluwe-saint-pierre",
  "woluwe-saint-lambert", "1160", "1170", "1150", "1200",
]);

function proximityScore(city: string | null): { score: number; label: string } {
  if (!city) return { score: 0, label: "Ville inconnue" };
  const c = city.toLowerCase().trim();
  // Tentative match sur le contenu (le champ peut être "Bruxelles, 1000")
  for (const key of BRUSSELS_CORE) if (c.includes(key)) return { score: 25, label: "Bruxelles (core)" };
  for (const key of BRUSSELS_NEAR) if (c.includes(key)) return { score: 20, label: "Bruxelles élargi" };
  for (const key of BRUSSELS_FAR) if (c.includes(key)) return { score: 15, label: "Bruxelles périphérie" };
  // Brabant proche
  if (/halle|vilvorde|leuven|wavre|nivelles|wemmel|drogenbos|sint-pieters/.test(c))
    return { score: 10, label: "Brabant proche" };
  // Autres Wallonie / Flandre
  if (/charleroi|liege|namur|mons|antwerpen|gent|brugge/.test(c))
    return { score: 5, label: "Belgique éloignée" };
  // Etranger
  if (/maroc|france|paris|tunis|algier|casablanca/.test(c))
    return { score: 0, label: "Étranger" };
  return { score: 5, label: "Belgique (autre)" };
}

// ─── Langues ───────────────────────────────────────────────────────────────

function languagesScore(langs: Record<string, unknown> | null): { score: number; summary: string } {
  if (!langs) return { score: 0, summary: "Aucune langue déclarée" };
  const keys = Object.keys(langs).map((k) => k.toLowerCase());
  const hasFR = keys.some((k) => k.startsWith("fr") || k === "français");
  const hasAR = keys.some((k) => k.startsWith("ar") || k === "arabe");
  const hasEN = keys.some((k) => k.startsWith("en") || k === "anglais");
  const hasNL = keys.some((k) => k.startsWith("nl") || k.startsWith("nee"));
  const otherCount = Math.max(0, keys.length - (hasFR ? 1 : 0) - (hasAR ? 1 : 0));
  if (hasFR && hasAR && (hasEN || hasNL || otherCount > 0))
    return { score: 25, summary: "FR + AR + autres (parfait)" };
  if (hasFR && hasAR) return { score: 20, summary: "FR + AR" };
  if (hasFR && (hasEN || hasNL)) return { score: 15, summary: "FR + langue tierce (sans AR)" };
  if (hasFR) return { score: 10, summary: "FR uniquement" };
  if (hasAR) return { score: 8, summary: "AR sans FR (limite client)" };
  return { score: 0, summary: "Sans FR ni AR" };
}

// ─── Âge ────────────────────────────────────────────────────────────────────

function ageScore(birthDate: string | null): { score: number; age: number | null } {
  if (!birthDate) return { score: 0, age: null };
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return { score: 0, age: null };
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  if (age < 0 || age > 100) return { score: 0, age: null };
  // Sweet spot retail Caftan
  if (age >= 25 && age <= 35) return { score: 25, age };
  if ((age >= 20 && age < 25) || (age > 35 && age <= 45)) return { score: 18, age };
  if ((age >= 18 && age < 20) || (age > 45 && age <= 55)) return { score: 10, age };
  return { score: 5, age };
}

// ─── Fraîcheur ─────────────────────────────────────────────────────────────

function freshnessScore(appliedAt: string | null): { score: number; days: number | null } {
  if (!appliedAt) return { score: 0, days: null };
  const d = new Date(appliedAt);
  if (Number.isNaN(d.getTime())) return { score: 0, days: null };
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { score: 25, days };
  if (days < 7) return { score: 25, days };
  if (days < 30) return { score: 18, days };
  if (days < 90) return { score: 10, days };
  if (days < 180) return { score: 5, days };
  return { score: 0, days };
}

// ─── Score global ──────────────────────────────────────────────────────────

export function computeCandidateScore(c: CandidateForScoring): {
  score: number;
  breakdown: ScoreBreakdown;
} {
  const prox = proximityScore(c.city);
  const lang = languagesScore(c.langs);
  const ageR = ageScore(c.birth_date);
  const fresh = freshnessScore(c.applied_at);
  const score = prox.score + lang.score + ageR.score + fresh.score;
  return {
    score,
    breakdown: {
      proximity: prox.score,
      languages: lang.score,
      age: ageR.score,
      freshness: fresh.score,
      city_label: prox.label,
      age_value: ageR.age,
      langs_summary: lang.summary,
      days_since_applied: fresh.days,
    },
  };
}
