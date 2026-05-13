// Supprime les shifts orphelins d'Ilham (site_id NULL) crees ce 13 mai 2026
// par le solver employe avant la regle "site obligatoire". Karim doit
// affecter Ilham a un site puis re-generer.

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

const { rows } = await c.query(`
  select s.id, s.date::text as d, s.start_time, s.end_time, s.site_id, s.is_overtime, s.created_at::text as created
  from shifts s
  where s.employee_id = (select id from employees where full_name = 'Ilham Serghini')
    and s.site_id is null
    and s.created_at::date = '2026-05-13'
  order by s.date
`);
console.log(`Shifts Ilham sans site crees aujourd'hui : ${rows.length}`);
for (const r of rows) console.log(`  ${r.id.slice(0,8)} | ${r.d} ${r.start_time}-${r.end_time}`);

if (!APPLY) {
  console.log("\n[DRY-RUN] Relance avec --apply");
  await c.end();
  process.exit(0);
}

if (rows.length > 0) {
  const ids = rows.map((r) => r.id);
  const r = await c.query(`delete from shifts where id = any($1::uuid[])`, [ids]);
  console.log(`\n✅ ${r.rowCount} supprimes`);
}
await c.end();
