// Verifie si la semaine prochaine a deja des shifts existants (qui causeraient
// le rejet "0/4 drafts OK" via l'anti-double-booking).
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

const nextMonday = "2026-05-18";
const nextSunday = "2026-05-24";

const { rows } = await c.query(`
  select s.code as site, sh.date::text as d, sh.start_time, sh.end_time,
         e.full_name, sh.is_overtime, sh.created_at::text as created
  from shifts sh
  left join sites s on s.id = sh.site_id
  left join employees e on e.id = sh.employee_id
  where sh.date between $1 and $2
  order by sh.date, sh.start_time
`, [nextMonday, nextSunday]);

console.log(`=== Shifts existants semaine ${nextMonday} -> ${nextSunday} (${rows.length}) ===`);
for (const r of rows) {
  console.log(`  ${r.d} ${r.start_time.slice(0,5)}-${r.end_time.slice(0,5)} | site=${r.site ?? "—"} | ${r.full_name} ${r.is_overtime ? "[OT]" : ""} | crée ${r.created.slice(0,16)}`);
}

const { rows: drafts } = await c.query(`
  select id, site_id, status, week_monday, generated_at::text as gen, applied_at::text as applied
  from auto_plan_drafts
  where week_monday = $1
  order by generated_at desc
  limit 20
`, [nextMonday]);
console.log(`\n=== auto_plan_drafts pour ${nextMonday} (${drafts.length}) ===`);
for (const d of drafts) console.log(`  ${d.id.slice(0,8)} | site=${d.site_id.slice(0,8)} | status=${d.status} | gen=${d.gen.slice(0,16)} | applied=${d.applied?.slice(0,16) ?? "—"}`);

await c.end();
