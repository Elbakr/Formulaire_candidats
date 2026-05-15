import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows } = await c.query(`
  select id, date::text as date_text, label
  from holidays
  where date >= '2026-05-20' and date <= '2026-05-31'
`);
for (const r of rows) {
  console.log(`id=${r.id} | date_text="${r.date_text}" | label="${r.label}"`);
}

const { rows: pent } = await c.query(`
  select id, date::text as d, label
  from holidays
  where label ilike '%entec%'
`);
console.log(`\nilike '%entec%' total: ${pent.length}`);
for (const r of pent) {
  console.log(`  id=${r.id} | date=${r.d} | label="${r.label}"`);
}

await c.end();
