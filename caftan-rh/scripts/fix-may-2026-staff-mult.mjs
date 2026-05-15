// Karim 15/05 : renforcer staff_multiplier sur Pentecote et Aid j+1.
// Pentecote 25 mai (jour ferie legal) -> rush boutique = 1.5x effectif.
// Aid j+1 27 mai (post-fete) -> rush retour clientele = 1.5x.
// L Aid j-1 (25 mai meme date Pentecote) reste a 2.0x, MAX gagne via le solver.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const APPLY = process.argv.includes("--apply");
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log(`\n=== Fix staff_multiplier mai 2026 (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

const targets = [
  { id: "ab484c1f-72b0-4de9-b398-5afddffef4d2", label: "Lundi de Pentecôte", newMult: 1.5 },
  { id: "88e78d80-3c75-4665-a52f-5f5a7819dc62", label: "Aïd al-Adha 1447 j+1", newMult: 1.5 },
];

for (const t of targets) {
  const { rows } = await c.query(
    `select id, date::text as d, label, staff_multiplier from holidays where id = $1`,
    [t.id],
  );
  if (rows.length === 0) {
    console.log(`[SKIP] id=${t.id} (${t.label}) non trouve`);
    continue;
  }
  const r = rows[0];
  console.log(`[FIX]  ${r.d} | ${r.label.padEnd(35)} | staff_mult ${r.staff_multiplier} -> ${t.newMult}`);
  if (APPLY) {
    await c.query(`update holidays set staff_multiplier = $1 where id = $2`, [t.newMult, t.id]);
  }
}

console.log(`\n--- Etat final 20-31 mai 2026 ---`);
const { rows: after } = await c.query(`
  select date::text as d, label, shops_closed, staff_multiplier
  from holidays
  where date >= '2026-05-20' and date <= '2026-05-31'
  order by date, id
`);
for (const r of after) {
  const flag = r.shops_closed ? "🚫 FERME " : "✅ OUVERT";
  console.log(`  ${r.d} | ${r.label.padEnd(35)} | ${flag} | staff_mult=${r.staff_multiplier}`);
}

console.log(`\n${APPLY ? "✅ Applique." : "[DRY-RUN]"}\n`);
await c.end();
