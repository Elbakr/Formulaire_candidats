// Karim 2026-07-11 : droit au travail en Belgique / UE (helper PUR, sans DB/IA).
//
// Règle : un ressortissant UE / EEE / Suisse a le droit de travailler sans permis.
// Hors-UE : il faut un titre de séjour VALIDE autorisant le travail — et la
// décision finale reste HUMAINE (admin) : on escalade (permis unique, et pour les
// détachés Limosa + A1 — étape 2). On ne tranche jamais seul « refusé ».

/** Statut calculé du droit au travail. */
export type WorkAuthStatus = "ue" | "titre_valide" | "a_verifier" | "refuse";

export type WorkAuthResult = {
  status: WorkAuthStatus;
  /** true = intervention admin requise (vérif humaine + docs à demander). */
  needsAdmin: boolean;
  reason: string;
  /** Jours avant expiration du document (négatif = déjà expiré), null si inconnu. */
  daysToExpiry: number | null;
};

// UE (27) + EEE (Islande, Liechtenstein, Norvège) + Suisse. Tokens normalisés :
// noms FR/EN, gentilés, codes ISO2/ISO3. Comparaison sur nationalité normalisée.
const EU_EEA_CH_TOKENS = new Set<string>([
  // Belgique
  "belgique","belgium","belge","belgian","be","bel",
  "france","francaise","french","fr","fra",
  "allemagne","germany","allemande","german","de","deu","allemand",
  "pays-bas","paysbas","netherlands","neerlandaise","dutch","nl","nld","hollandaise",
  "luxembourg","luxembourgeoise","lu","lux",
  "italie","italy","italienne","italian","it","ita",
  "espagne","spain","espagnole","spanish","es","esp",
  "portugal","portugaise","portuguese","pt","prt",
  "irlande","ireland","irlandaise","irish","ie","irl",
  "autriche","austria","autrichienne","austrian","at","aut",
  "grece","greece","grecque","greek","gr","grc",
  "pologne","poland","polonaise","polish","pl","pol",
  "roumanie","romania","roumaine","romanian","ro","rou",
  "bulgarie","bulgaria","bulgare","bulgarian","bg","bgr",
  "hongrie","hungary","hongroise","hungarian","hu","hun",
  "republique tcheque","tchequie","czech","czechia","tcheque","cz","cze",
  "slovaquie","slovakia","slovaque","slovak","sk","svk",
  "slovenie","slovenia","slovene","slovenian","si","svn",
  "croatie","croatia","croate","croatian","hr","hrv",
  "danemark","denmark","danoise","danish","dk","dnk",
  "suede","sweden","suedoise","swedish","se","swe",
  "finlande","finland","finlandaise","finnish","fi","fin",
  "estonie","estonia","estonienne","estonian","ee","est",
  "lettonie","latvia","lettone","latvian","lv","lva",
  "lituanie","lithuania","lituanienne","lithuanian","lt","ltu",
  "malte","malta","maltaise","maltese","mt","mlt",
  "chypre","cyprus","chypriote","cypriot","cy","cyp",
  // EEE
  "islande","iceland","islandaise","icelandic","is","isl",
  "liechtenstein","li","lie","liechtensteinoise",
  "norvege","norway","norvegienne","norwegian","no","nor",
  // Suisse
  "suisse","switzerland","swiss","ch","che",
]);

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .trim();
}

/** La nationalité est-elle UE / EEE / Suisse ? */
export function isEuEeaCh(nationality: string | null | undefined): boolean {
  const n = normalize(nationality);
  if (!n) return false;
  if (EU_EEA_CH_TOKENS.has(n)) return true;
  // Tolère "nationalité belge", "de nationalité française", etc. : on teste chaque mot.
  for (const w of n.split(/[\s-]+/)) {
    if (w.length >= 2 && EU_EEA_CH_TOKENS.has(w)) return true;
  }
  return false;
}

/**
 * Calcule le droit au travail à partir de la nationalité + document.
 * `today` injectable pour les tests (défaut = maintenant).
 */
export function computeWorkAuthorization(input: {
  nationality: string | null | undefined;
  /** Type de doc extrait : 'ci_belge' | 'titre_sejour' | 'passeport' | ... */
  docType?: string | null;
  /** Date de validité "YYYY-MM-DD" (titre de séjour surtout). */
  expiry?: string | null;
  /** Le document mentionne-t-il l'autorisation de travailler ? (IA, best-effort) */
  authorizesWork?: boolean | null;
  today?: string; // "YYYY-MM-DD"
}): WorkAuthResult {
  const today = input.today ?? new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const daysToExpiry = input.expiry
    ? Math.round((Date.parse(input.expiry + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000)
    : null;
  const expired = daysToExpiry != null && daysToExpiry < 0;

  // UE / EEE / Suisse : droit au travail sans permis (le doc peut néanmoins expirer).
  if (isEuEeaCh(input.nationality)) {
    return {
      status: "ue",
      needsAdmin: expired, // seule l'expiration mérite un coup d'œil
      reason: expired
        ? "Ressortissant UE/EEE/Suisse — pièce d'identité EXPIRÉE, à renouveler."
        : "Ressortissant UE/EEE/Suisse : droit au travail sans permis.",
      daysToExpiry,
    };
  }

  // Hors-UE : titre de séjour requis. Décision finale HUMAINE dans tous les cas.
  if (expired) {
    return {
      status: "refuse",
      needsAdmin: true,
      reason: "Hors-UE — titre de séjour EXPIRÉ. Vérifier et demander un titre valide autorisant le travail.",
      daysToExpiry,
    };
  }
  if (input.authorizesWork === true && input.expiry) {
    return {
      status: "titre_valide",
      needsAdmin: true, // l'admin confirme (permis unique / Limosa+A1 si détaché)
      reason: "Hors-UE — titre de séjour valide semblant autoriser le travail. À VÉRIFIER par l'admin (permis unique ; Limosa + A1 si détaché).",
      daysToExpiry,
    };
  }
  return {
    status: "a_verifier",
    needsAdmin: true,
    reason: "Hors-UE — droit au travail à VÉRIFIER par l'admin : titre de séjour autorisant le travail requis (permis unique ; Limosa + A1 si travailleur détaché).",
    daysToExpiry,
  };
}
