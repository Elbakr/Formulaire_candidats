// Force la date d'Ascension 2026 a 2026-05-14 (jeudi), pas 2026-05-13.
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

const { rows: before } = await c.query(
  `select id, date::text as date_text, label, country
   from holidays where label ilike '%ascension%' order by date`,
);
console.log("AVANT :");
for (const r of before) console.log(`  ${r.id} | ${r.date_text} | ${r.label} | ${r.country ?? ""}`);

if (!APPLY) {
  console.log("\n[DRY-RUN]");
  await c.end();
  process.exit(0);
}

const r = await c.query(
  `update holidays set date='2026-05-14'
   where label ilike 'Ascension' and date::text='2026-05-13' returning id, date::text as date_text, label`,
);
console.log(`\n${r.rowCount} ligne(s) mise(s) a jour :`);
for (const row of r.rows) console.log(`  ${row.id} | ${row.date_text} | ${row.label}`);

await c.end();
