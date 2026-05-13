// Reclassifie en masse les heures excedentaires en OT pour tous les employes
// en depassement quota cette semaine. Karim 2026-05-13 audit du jour.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
const APPLY = process.argv.includes("--apply");
const MULT = 1.5;
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const today = new Date();
const monday = new Date(today);
const offset = today.getDay() === 0 ? -6 : 1 - today.getDay();
monday.setDate(today.getDate() + offset);
const mondayISO = monday.toISOString().slice(0, 10);
const sundayISO = new Date(monday.getTime() + 6 * 86400000).toISOString().slice(0, 10);

const { rows: emps } = await c.query(`
  select e.id, e.full_name, e.weekly_hours,
    coalesce(sum(case when s.is_overtime=false then
      (extract(epoch from (s.end_time - s.start_time)) - coalesce(s.break_minutes,0)*60)/3600 end), 0) as h
  from employees e
  left join shifts s on s.employee_id = e.id and s.date between $1 and $2
  where e.status='active' group by e.id, e.full_name, e.weekly_hours
  having coalesce(sum(case when s.is_overtime=false then
    (extract(epoch from (s.end_time - s.start_time)) - coalesce(s.break_minutes,0)*60)/3600 end), 0) > e.weekly_hours + 0.5
  order by e.full_name
`, [mondayISO, sundayISO]);

console.log(`\n=== Reclassif OT (${APPLY ? "APPLY" : "DRY-RUN"}) semaine ${mondayISO}-${sundayISO} ===\n`);

let totalReclassified = 0;
let totalHours = 0;
for (const emp of emps) {
  const target = emp.weekly_hours;
  const planned = Number(emp.h);
  const excess = planned - target;
  console.log(`${emp.full_name.padEnd(28)} ${planned.toFixed(1)}h/${target}h | +${excess.toFixed(1)}h a reclasser`);

  // Recupere les shifts contractuels les plus recents
  const { rows: shifts } = await c.query(`
    select id, start_time, end_time, break_minutes
    from shifts where employee_id = $1 and date between $2 and $3
    and is_overtime = false order by created_at desc
  `, [emp.id, mondayISO, sundayISO]);

  let remaining = planned;
  const toFlag = [];
  for (const s of shifts) {
    if (remaining <= target + 0.01) break;
    const h = (
      (new Date(`2000-01-01T${s.end_time}`).getTime() - new Date(`2000-01-01T${s.start_time}`).getTime()) / 3600000
      - (s.break_minutes ?? 0) / 60
    );
    toFlag.push({ id: s.id, h });
    remaining -= h;
  }
  for (const f of toFlag) {
    console.log(`  -> reclassifier ${f.id.slice(0,8)} (${f.h.toFixed(1)}h) en OT x${MULT}`);
    if (APPLY) {
      await c.query(
        `update shifts set is_overtime=true, overtime_multiplier=$1 where id=$2`,
        [MULT, f.id],
      );
    }
    totalReclassified++;
    totalHours += f.h;
  }
}
console.log(`\n${APPLY ? "✅" : "[DRY-RUN]"} ${totalReclassified} shifts reclassifies (${totalHours.toFixed(1)}h)`);
await c.end();
