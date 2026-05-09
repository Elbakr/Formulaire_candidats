// Détection de genre à partir d'un prénom.
// Heuristic from old recrutement.html — not exhaustive, expand as needed.
//
// Stratégie :
// 1. Match exact dans dictionnaires F / M (BE/FR/AR/Africain courants)
// 2. Sinon morphologie (terminaisons -e/-a/-ia/-ine = F, -ar/-our/-oud = M)
// 3. Sinon "unknown"
//
// Hardcoded mapping is fine — keep it short and add a clear comment.

const PRENOMS_F = new Set<string>([
  // BE/FR
  "marie", "sophie", "julie", "claire", "lea", "léa", "manon", "chloe", "chloé",
  "camille", "emma", "alice", "louise", "sarah", "anais", "anaïs", "elise", "élise",
  "sandrine", "celine", "céline", "nathalie", "isabelle", "valerie", "valérie",
  "audrey", "stephanie", "stéphanie", "amelie", "amélie", "laura", "pauline",
  // AR/MA
  "aya", "souad", "salima", "hidaya", "yasmine", "yasmina", "chaimae", "chaymae",
  "hafsa", "ibtissem", "ibtissam", "keltoum", "kaouthar", "kawtar", "ilham",
  "omaima", "oumaima", "fatima", "fatma", "khadija", "rachida", "samira", "zineb",
  "naima", "houda", "hanane", "amina", "leila", "leïla", "nadia", "asma", "asmae",
  "imane", "iman", "wafa", "wafae", "siham", "soumia", "loubna", "fadwa",
  "meriem", "myriam", "mariam", "malika", "samia", "jihane", "kenza", "rania",
  "sabrina", "nora", "noura", "yousra", "warda", "rabia", "halima", "salma",
  "saida", "nawal", "fatiha", "habiba", "saadia", "houria", "zohra", "amal",
  // Africain courants
  "aminata", "fatoumata", "awa", "aissa", "aïssa", "binta", "khady", "rokhaya",
]);

const PRENOMS_M = new Set<string>([
  // BE/FR
  "pierre", "jean", "paul", "luc", "marc", "philippe", "thomas", "nicolas",
  "alexandre", "antoine", "francois", "françois", "michel", "patrick", "olivier",
  "david", "julien", "vincent", "guillaume", "romain", "maxime", "benjamin",
  "hugo", "louis", "leo", "léo", "raphael", "raphaël", "arthur", "lucas", "nathan",
  // AR/MA
  "ali", "salmane", "salman", "ramdane", "mohamed", "mohammed", "ahmed", "ahmad",
  "hassan", "hicham", "youssef", "yousef", "yassine", "karim", "khalid", "abdel",
  "abdellah", "abdallah", "rachid", "amine", "anas", "ayoub", "bilal", "brahim",
  "ibrahim", "ismail", "ismaïl", "mehdi", "mounir", "mostafa", "mustafa", "moussa",
  "nabil", "omar", "othmane", "redouane", "saad", "said", "saïd", "tarik", "tarek",
  "walid", "yacine", "younes", "younis", "zakaria", "habib", "hamza", "imad",
  "jamal", "kamal", "majid", "mansour", "mounir", "nordine", "noureddine",
  "rabah", "rida", "samir", "sofiane", "sofian", "soufiane", "soufian", "taha",
  "wassim", "yanis", "ziad", "zied",
  // Africain courants
  "ousmane", "mamadou", "ibrahima", "moussa", "abdou", "cheikh", "souleymane",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z]/g, "")
    .trim();
}

export function detectGender(firstName: string | null | undefined): "F" | "M" | "unknown" {
  if (!firstName) return "unknown";
  const raw = String(firstName).trim().split(/\s+/)[0] ?? "";
  if (!raw) return "unknown";
  const k = raw.toLowerCase();
  const norm = normalize(raw);
  if (PRENOMS_F.has(k) || PRENOMS_F.has(norm)) return "F";
  if (PRENOMS_M.has(k) || PRENOMS_M.has(norm)) return "M";

  // Morphologic fallback (last 2-3 chars)
  if (/(?:ia|na|ra|la|ma|sa|ya|ka)$/.test(norm)) return "F";
  if (/(?:ee|ée|ette|ine|elle|ique|ance|ence)$/.test(k)) return "F";
  if (/(?:ar|our|oud|ane|ame|im|id|am|af|ef|ud|us)$/.test(norm)) return "M";

  return "unknown";
}

export function genderLabel(g: "F" | "M" | "unknown"): string {
  if (g === "F") return "Femme";
  if (g === "M") return "Homme";
  return "—";
}

export function genderEmoji(g: "F" | "M" | "unknown"): string {
  if (g === "F") return "👩";
  if (g === "M") return "👨";
  return "❓";
}
