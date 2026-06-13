// Karim 2026-06-13 : detection automatique commune/ville depuis le code postal
// belge. Philosophie "automatiser au max" : on remplit la ville a la place du
// travailleur des qu'il tape son code postal (champ en moins a saisir).
//
// Strategie : table locale pour les communes les plus frequentes (Bruxelles +
// Anvers = nos 3 magasins et la majorite des travailleurs) -> reponse INSTANTANEE
// et hors-ligne ; fallback API publique gratuite zippopotam.us pour le reste de
// la Belgique. Le champ reste toujours editable (la table n'est pas exhaustive).

// Helpers client-safe (pas de server-only) : utilisable dans un composant client.

const LOCAL_BE: Record<string, string> = {
  // Region bruxelloise (19 communes)
  "1000": "Bruxelles",
  "1020": "Laeken",
  "1030": "Schaerbeek",
  "1040": "Etterbeek",
  "1050": "Ixelles",
  "1060": "Saint-Gilles",
  "1070": "Anderlecht",
  "1080": "Molenbeek-Saint-Jean",
  "1081": "Koekelberg",
  "1082": "Berchem-Sainte-Agathe",
  "1083": "Ganshoren",
  "1090": "Jette",
  "1140": "Evere",
  "1150": "Woluwe-Saint-Pierre",
  "1160": "Auderghem",
  "1170": "Watermael-Boitsfort",
  "1180": "Uccle",
  "1190": "Forest",
  "1200": "Woluwe-Saint-Lambert",
  "1210": "Saint-Josse-ten-Noode",
  // Peripherie proche frequente
  "1500": "Halle",
  "1600": "Sint-Pieters-Leeuw",
  "1700": "Dilbeek",
  "1800": "Vilvoorde",
  "1830": "Machelen",
  // Anvers (district + communes courantes)
  "2000": "Antwerpen",
  "2018": "Antwerpen",
  "2020": "Antwerpen",
  "2030": "Antwerpen",
  "2040": "Antwerpen",
  "2050": "Antwerpen",
  "2060": "Antwerpen",
  "2070": "Zwijndrecht",
  "2100": "Deurne",
  "2140": "Borgerhout",
  "2170": "Merksem",
  "2180": "Ekeren",
  "2600": "Berchem",
  "2610": "Wilrijk",
  "2660": "Hoboken",
};

/** True si le code ressemble a un code postal belge (4 chiffres). */
export function isBePostalCode(code: string): boolean {
  return /^\d{4}$/.test(code.trim());
}

/** Lookup synchrone dans la table locale (instantane). */
export function localBeCity(code: string): string | null {
  return LOCAL_BE[code.trim()] ?? null;
}

/**
 * Detecte la ville/commune depuis un code postal belge.
 * Table locale d'abord (instantane), sinon API publique. Renvoie null si
 * introuvable / hors-ligne (le champ reste alors a saisir manuellement).
 */
export async function lookupBeCity(code: string): Promise<string | null> {
  const c = code.trim();
  if (!isBePostalCode(c)) return null;
  const local = LOCAL_BE[c];
  if (local) return local;
  try {
    const res = await fetch(`https://api.zippopotam.us/be/${c}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { places?: Array<{ "place name"?: string }> };
    const place = j.places && j.places[0];
    return place?.["place name"]?.trim() || null;
  } catch {
    return null;
  }
}
