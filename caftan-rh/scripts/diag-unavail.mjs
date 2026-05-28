import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  select e.full_name, u.id, u.day_of_week, u.date_specific, u.start_time, u.end_time, u.is_active, u.reason, u.created_at
  from employee_unavailabilities u
  join employees e on e.id = u.employee_id
  where u.day_of_week is not null
  order by u.created_at desc
  limit 20;
`);
console.table(r.rows);
console.log("---");
const r2 = await c.query(`
  select column_name, data_type, column_default, is_nullable
  from information_schema.columns
  where table_name='employee_unavailabilities'
  order by ordinal_position;
`);
console.table(r2.rows);
await c.end();
