import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  select to_char(date_trunc('week', date::timestamp)::date, 'YYYY-MM-DD') as monday,
         count(*) as nb_shifts,
         count(distinct employee_id) as nb_emps,
         count(distinct site_id) filter (where site_id is not null) as sites_with_shifts,
         count(*) filter (where site_id is null) as shifts_no_site,
         count(*) filter (where is_overtime = true) as ot_shifts
  from shifts
  where date >= current_date - interval '7 days'
    and date <= current_date + interval '35 days'
  group by 1 order by 1;
`);
console.table(r.rows);
await c.end();
