// Liste les employes actifs sans site_assignments actif aujourd'hui.
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

const today = new Date().toISOString().slice(0, 10);
const { rows } = await c.query(`
  select e.id, e.full_name, e.weekly_hours, e.contract_type, e.start_date
  from employees e
  where e.status = 'active'
    and not exists (
      select 1 from site_assignments a
      where a.employee_id = e.id
        and a.start_date <= $1
        and (a.end_date is null or a.end_date >= $1)
    )
  order by e.start_date desc, e.full_name
`, [today]);

console.log(`\n=== Employes actifs SANS site affecte (${rows.length}) ===`);
for (const r of rows) {
  console.log(`  ${r.full_name.padEnd(30)} | ${(r.contract_type ?? "?").padEnd(10)} | ${r.weekly_hours ?? "?"}h/sem | depuis ${r.start_date ?? "—"}`);
}

await c.end();
