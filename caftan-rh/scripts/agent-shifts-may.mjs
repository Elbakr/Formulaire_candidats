// Agent autonome : list shifts planifies mai 2026 pour deduire slots manquants.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const SITE_A = "382a0de9-71bd-481e-a5d6-f3aaa38457f0";
const SITE_E = "96bf828c-24e7-483a-ac61-62b95ea319d4";
const SITE_B = "ce212d94-b200-430a-a971-67c21c582217";
const SITE_D = "7427aeb8-cfeb-4a50-b431-d6008364180d";

console.log("=== Shifts mai 2026 site A (et fallbacks B, D) par employee + jour ===");
const r = await c.query(`
  select e.id as emp_id, e.full_name, s.code as site_code, sh.date, sh.start_time, sh.end_time
  from shifts sh
  join employees e on e.id = sh.employee_id
  join sites s on s.id = sh.site_id
  where sh.date >= '2026-05-01' and sh.date <= '2026-05-24'
    and sh.site_id in ($1, $2, $3, $4)
  order by e.full_name, sh.date
`, [SITE_A, SITE_B, SITE_D, SITE_E]);

let prev = "";
for (const row of r.rows) {
  if (row.full_name !== prev) {
    console.log(`\n${row.full_name} (${row.emp_id.slice(0,8)})`);
    prev = row.full_name;
  }
  const d = row.date.toISOString().slice(0,10);
  console.log(`  ${d} | Site ${row.site_code} | ${row.start_time}-${row.end_time}`);
}

await c.end();
