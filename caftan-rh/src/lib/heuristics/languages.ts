// Heuristique langues : par défaut FR + AR (cas typique des candidats Caftan Bruxelles).
// Heuristic from old recrutement.html — la majorité des candidats parlent FR+AR.
// On n'écrit JAMAIS dans la DB depuis cette fonction : c'est uniquement pour l'affichage
// quand candidate.langs est vide ou null.

export type LangsMap = Record<string, string>;

export const DEFAULT_LANGS: LangsMap = {
  Français: "Courant",
  Arabe: "Courant",
};

export function inferLangs(candidate: { langs?: LangsMap | null } | null | undefined): LangsMap {
  const declared = candidate?.langs ?? null;
  if (declared && typeof declared === "object" && Object.keys(declared).length > 0) {
    return declared;
  }
  return { ...DEFAULT_LANGS };
}

/** True si les langues incluent au moins FR ET AR (exigence éliminatoire ancienne). */
export function hasFRandAR(langs: LangsMap): boolean {
  const keys = Object.keys(langs).map((k) => k.toLowerCase());
  const hasFR = keys.some((k) => k.startsWith("fra") || k === "fr");
  const hasAR = keys.some((k) => k.startsWith("ara") || k === "ar");
  return hasFR && hasAR;
}

const LEVEL_RANK: Record<string, number> = {
  notion: 1,
  notions: 1,
  débutant: 1,
  debutant: 1,
  scolaire: 2,
  intermediaire: 3,
  intermédiaire: 3,
  bon: 3,
  bonne: 3,
  courant: 4,
  fluent: 4,
  bilingue: 5,
  maternelle: 5,
  natif: 5,
};

/** Compare deux niveaux (>= minLevel ?) — case-insensitive. */
export function levelMeets(level: string | undefined | null, minLevel: string): boolean {
  if (!level) return false;
  const a = LEVEL_RANK[String(level).toLowerCase().trim()] ?? 0;
  const b = LEVEL_RANK[String(minLevel).toLowerCase().trim()] ?? 0;
  return a >= b;
}
