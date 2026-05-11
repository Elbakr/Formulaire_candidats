// Politique magasins Caftan Factory (decision Karim 2026-05-11) :
// AUCUN magasin ne ferme jamais SAUF les 2 Aid annuels (Aid al-Fitr + Aid al-Adha,
// jour J et J+1 pour chacun = 4 jours/an au total).
//
// 1. Fix date Ascension 2026 (etait 13/05, doit etre jeudi 14/05).
// 2. Backfill : shops_closed=true pour Aid uniquement, tout le reste = false.

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

console.log(`\n=== Holiday policy fix (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

// --- 1. Fix Ascension date -----------------------------------------------
const { rows: ascRows } = await c.query(
  `select id, date::text as date_text, label
   from holidays where label ilike 'Ascension' and date::text='2026-05-13'`,
);
if (ascRows.length > 0) {
  console.log(`[1] Ascension : 2026-05-13 -> 2026-05-14`);
  if (APPLY) {
    await c.query(`update holidays set date='2026-05-14' where id=$1`, [ascRows[0].id]);
  }
} else {
  console.log("[1] Ascension 2026-05-13 : non trouvee (deja fixee ?)");
}

// --- 2. Reset shops_closed=false pour tout, puis true pour les Aid -------
console.log("\n[2] Reset shops_closed=false partout");
if (APPLY) {
  await c.query(`update holidays set shops_closed=false where shops_closed=true`);
}

console.log("\n[3] Marque shops_closed=true uniquement pour Aid al-Fitr + Aid al-Adha (J et J+1)");
const { rows: aidRows } = await c.query(
  `select id, date::text as date_text, label
   from holidays
   where (label ilike '%a%d al-fitr%' or label ilike '%a%d al-adha%')
     and is_active = true
   order by date`,
);
console.log(`Trouve ${aidRows.length} entrees Aid :`);
for (const a of aidRows) {
  console.log(`  ${a.date_text} | ${a.label}`);
}
if (APPLY && aidRows.length > 0) {
  const ids = aidRows.map((r) => r.id);
  const r = await c.query(
    `update holidays set shops_closed=true where id = any($1::uuid[]) returning id`,
    [ids],
  );
  console.log(`  -> ${r.rowCount} marquees shops_closed=true`);
}

// --- 4. Etat final -------------------------------------------------------
const { rows: feries } = await c.query(
  `select date::text as date_text, label, kind, shops_closed
   from holidays
   where is_active = true and date >= current_date and date <= current_date + 365
   order by date`,
);
console.log(`\n[4] Etat final feries 12 prochains mois (${feries.length}) :`);
for (const f of feries) {
  const marker = f.shops_closed ? "🚫 FERME" : "🟢 ouvert";
  console.log(`  ${f.date_text} | ${marker} | ${f.label}`);
}

console.log(`\n${APPLY ? "✅ Politique appliquee." : "[DRY-RUN]"}`);
await c.end();
