// Agent : qui travaille sur quel site
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log("=== Site assignments actifs ===");
const r = await c.query(`
  select e.id, e.full_name, e.status, s.code as site_code, sa.is_primary, sa.start_date, sa.end_date
  from site_assignments sa
  join employees e on e.id = sa.employee_id
  join sites s on s.id = sa.site_id
  where e.status = 'active'
    and (sa.end_date is null or sa.end_date >= '2026-05-01')
    and sa.start_date <= '2026-05-24'
  order by s.code, e.full_name
`);
let prev = "";
for (const row of r.rows) {
  if (row.site_code !== prev) {
    console.log(`\n== Site ${row.site_code} ==`);
    prev = row.site_code;
  }
  console.log(`  ${row.full_name} (${row.id.slice(0,8)}) | primary=${row.is_primary} | ${row.start_date.toISOString().slice(0,10)} -> ${row.end_date ? row.end_date.toISOString().slice(0,10) : "open"}`);
}

await c.end();
