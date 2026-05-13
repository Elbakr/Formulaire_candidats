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
  select e.id, e.full_name, e.weekly_hours, e.fixed_off_days,
         string_agg(s.code, ',') as sites
  from employees e
  left join site_assignments a on a.employee_id = e.id
    and a.start_date <= $1 and (a.end_date is null or a.end_date >= $1)
  left join sites s on s.id = a.site_id
  where e.status = 'active'
  group by e.id, e.full_name, e.weekly_hours, e.fixed_off_days
  order by e.full_name
`, [today]);

console.log(`Actifs : ${rows.length}\n`);
for (const r of rows) {
  console.log(`  ${r.full_name.padEnd(28)} | ${r.weekly_hours}h/sem | off=${JSON.stringify(r.fixed_off_days)} | sites=${r.sites ?? "—"}`);
}

await c.end();
