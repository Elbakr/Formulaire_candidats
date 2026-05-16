import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(`
  select s.date::text as d, st.code, count(*)::int as n
  from shifts s
  left join sites st on st.id = s.site_id
  where s.date >= '2026-05-25' and s.date <= '2026-05-31'
  group by s.date, st.code
  order by s.date, st.code
`);

console.log(`\nShifts en base 25-31 mai :\n`);
let prev = "";
for (const r of rows) {
  if (r.d !== prev) {
    console.log(`\n--- ${r.d} ---`);
    prev = r.d;
  }
  console.log(`  Site ${r.code ?? "(aucun)"} : ${r.n} shifts`);
}

const { rows: tot } = await c.query(`
  select count(*)::int as n from shifts where date >= '2026-05-25' and date <= '2026-05-31'
`);
console.log(`\nTotal shifts semaine 25-31 mai : ${tot[0].n}`);

await c.end();
