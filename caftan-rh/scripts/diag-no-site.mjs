import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  select s.id, s.date, s.start_time, s.end_time, s.is_overtime, s.position, s.location, s.notes,
         s.created_at, s.created_by, e.full_name as emp_name
  from shifts s
  join employees e on e.id = s.employee_id
  where s.date between '2026-05-18' and '2026-05-24'
    and s.site_id is null
  order by s.created_at desc
  limit 10;
`);
console.table(r.rows);
await c.end();
