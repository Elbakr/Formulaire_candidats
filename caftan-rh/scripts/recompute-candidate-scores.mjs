// Karim 18/05 : recalcule match_score pour tous les candidats actifs.
// A relancer apres modif du barème (lib/scoring/candidate-match-score.ts) ou
// periodiquement (la fraicheur evolue avec le temps).
//
// Usage : node scripts/recompute-candidate-scores.mjs [--all|--null-only]
//   --null-only : ne recalcule que les candidates sans match_score (default).
//   --all       : force le recalcul de tous, meme deja scores.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const ALL = process.argv.includes("--all");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// Implementation inline du score (duplique depuis lib/scoring/candidate-match-score.ts
// pour ne pas avoir besoin d un build TS en CLI).
const BRUSSELS_CORE = new Set(["bruxelles","brussel","anderlecht","molenbeek","molenbeek-saint-jean","koekelberg","saint-gilles","saint-josse","saint-josse-ten-noode","forest","1000","1070","1080","1081","1060","1190"]);
const BRUSSELS_NEAR = new Set(["schaerbeek","ixelles","etterbeek","jette","laeken","evere","ganshoren","uccle","berchem-sainte-agathe","neder-over-heembeek","1030","1050","1040","1090","1140","1083","1180","1082"]);
const BRUSSELS_FAR = new Set(["auderghem","watermael-boitsfort","woluwe-saint-pierre","woluwe-saint-lambert","1160","1170","1150","1200"]);

function proximityScore(city) {
  if (!city) return { score: 0, label: "Ville inconnue" };
  const cc = city.toLowerCase().trim();
  for (const k of BRUSSELS_CORE) if (cc.includes(k)) return { score: 25, label: "Bruxelles (core)" };
  for (const k of BRUSSELS_NEAR) if (cc.includes(k)) return { score: 20, label: "Bruxelles élargi" };
  for (const k of BRUSSELS_FAR) if (cc.includes(k)) return { score: 15, label: "Bruxelles périphérie" };
  if (/halle|vilvorde|leuven|wavre|nivelles|wemmel|drogenbos|sint-pieters/.test(cc)) return { score: 10, label: "Brabant proche" };
  if (/charleroi|liege|namur|mons|antwerpen|gent|brugge/.test(cc)) return { score: 5, label: "Belgique éloignée" };
  if (/maroc|france|paris|tunis|algier|casablanca/.test(cc)) return { score: 0, label: "Étranger" };
  return { score: 5, label: "Belgique (autre)" };
}

function languagesScore(langs) {
  if (!langs) return { score: 0, summary: "Aucune langue" };
  const keys = Object.keys(langs).map((k) => k.toLowerCase());
  const fr = keys.some((k) => k.startsWith("fr") || k === "français");
  const ar = keys.some((k) => k.startsWith("ar") || k === "arabe");
  const en = keys.some((k) => k.startsWith("en") || k === "anglais");
  const nl = keys.some((k) => k.startsWith("nl") || k.startsWith("nee"));
  const other = Math.max(0, keys.length - (fr?1:0) - (ar?1:0));
  if (fr && ar && (en || nl || other > 0)) return { score: 25, summary: "FR+AR+autres" };
  if (fr && ar) return { score: 20, summary: "FR+AR" };
  if (fr && (en || nl)) return { score: 15, summary: "FR+tierce" };
  if (fr) return { score: 10, summary: "FR seul" };
  if (ar) return { score: 8, summary: "AR seul" };
  return { score: 0, summary: "Sans FR/AR" };
}

function ageScore(bd) {
  if (!bd) return { score: 0, age: null };
  const d = new Date(bd);
  if (isNaN(d)) return { score: 0, age: null };
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  if (age < 0 || age > 100) return { score: 0, age: null };
  if (age >= 25 && age <= 35) return { score: 25, age };
  if ((age >= 20 && age < 25) || (age > 35 && age <= 45)) return { score: 18, age };
  if ((age >= 18 && age < 20) || (age > 45 && age <= 55)) return { score: 10, age };
  return { score: 5, age };
}

function freshnessScore(at) {
  if (!at) return { score: 0, days: null };
  const d = new Date(at);
  if (isNaN(d)) return { score: 0, days: null };
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 7) return { score: 25, days };
  if (days < 30) return { score: 18, days };
  if (days < 90) return { score: 10, days };
  if (days < 180) return { score: 5, days };
  return { score: 0, days };
}

// Fetch
const where = ALL ? "" : "where match_score is null";
const { rows } = await c.query(`select id, city, birth_date, langs, applied_at from candidates ${where}`);
console.log(`\nRecalcul score sur ${rows.length} candidats${ALL ? "" : " (sans score)"}…`);

let n = 0;
for (const r of rows) {
  const prox = proximityScore(r.city);
  const lang = languagesScore(r.langs);
  const ageR = ageScore(r.birth_date);
  const fresh = freshnessScore(r.applied_at);
  const score = prox.score + lang.score + ageR.score + fresh.score;
  const breakdown = {
    proximity: prox.score, languages: lang.score, age: ageR.score, freshness: fresh.score,
    city_label: prox.label, age_value: ageR.age, langs_summary: lang.summary,
    days_since_applied: fresh.days,
  };
  await c.query(
    `update candidates set match_score = $1, match_breakdown = $2::jsonb, match_score_computed_at = now() where id = $3`,
    [score, JSON.stringify(breakdown), r.id],
  );
  n += 1;
  if (n % 100 === 0) console.log(`  ${n}/${rows.length}…`);
}
console.log(`✅ ${n} scores calcules.`);

// Statistiques
const { rows: stats } = await c.query(`
  select
    count(*) filter (where match_score >= 80) as excellent,
    count(*) filter (where match_score between 60 and 79) as bon,
    count(*) filter (where match_score between 40 and 59) as moyen,
    count(*) filter (where match_score < 40) as faible,
    round(avg(match_score)::numeric, 1) as moy
  from candidates where match_score is not null
`);
const s = stats[0];
console.log(`\nDistribution scores :`);
console.log(`  ≥ 80 (excellent) : ${s.excellent}`);
console.log(`  60-79 (bon)      : ${s.bon}`);
console.log(`  40-59 (moyen)    : ${s.moyen}`);
console.log(`  < 40 (faible)    : ${s.faible}`);
console.log(`  moyenne globale  : ${s.moy}/100`);

await c.end();
