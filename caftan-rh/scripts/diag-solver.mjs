// Audit complet du solver : pour la semaine en cours, simule ce que le solver
// devrait voir et identifie pourquoi 0 drafts sont generes.
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

const today = new Date();
const todayISO = today.toISOString().slice(0, 10);
const tomorrowISO = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
const monday = new Date(today);
const offset = today.getDay() === 0 ? -6 : 1 - today.getDay();
monday.setDate(today.getDate() + offset);
const mondayISO = monday.toISOString().slice(0, 10);
const sundayISO = new Date(monday.getTime() + 6 * 86400000).toISOString().slice(0, 10);

console.log(`=== Audit solver pour semaine ${mondayISO} → ${sundayISO} ===`);
console.log(`Aujourd'hui : ${todayISO} | J+1 : ${tomorrowISO}\n`);

// 1) Etat des quotas par employé actif
const { rows: emps } = await c.query(`
  select e.id, e.full_name, e.weekly_hours, e.fixed_off_days, e.ot_eligible,
         coalesce(sum(case when s.is_overtime = false then
           (extract(epoch from (s.end_time - s.start_time)) - coalesce(s.break_minutes,0)*60)/3600
         end), 0) as planned_h
  from employees e
  left join shifts s on s.employee_id = e.id and s.date between $1 and $2
  where e.status = 'active'
  group by e.id, e.full_name, e.weekly_hours, e.fixed_off_days, e.ot_eligible
  order by e.full_name
`, [mondayISO, sundayISO]);

console.log("=== Quotas par employe ===");
for (const r of emps) {
  const planned = Number(r.planned_h);
  const target = r.weekly_hours ?? 38;
  const remaining = Math.max(0, target - planned);
  console.log(`  ${r.full_name.padEnd(28)} | ${target}h cible | ${planned.toFixed(1)}h planifie | ${remaining.toFixed(1)}h restant | off=${JSON.stringify(r.fixed_off_days)} | ot=${r.ot_eligible}`);
}

// 2) Simulation : pour chaque jour future >= J+1, pour chaque site, qui peut y aller ?
console.log("\n=== Simulation jours future (J+1 → dimanche) ===");
const dayNames = ["dim","lun","mar","mer","jeu","ven","sam"];
for (let i = 0; i < 7; i++) {
  const d = new Date(monday.getTime() + i * 86400000);
  const dateISO = d.toISOString().slice(0,10);
  if (dateISO < tomorrowISO) continue;
  const jsDow = d.getDay();
  const isoDow = jsDow === 0 ? 6 : jsDow - 1;
  console.log(`\n  ${dateISO} ${dayNames[jsDow]} :`);

  // employes pas OFF ce jour
  const dispo = emps.filter((e) => {
    const off = (e.fixed_off_days ?? []);
    return !off.includes(isoDow);
  });
  console.log(`    ${dispo.length} employes non-off ce jour-la`);

  // employes pas encore satures
  const restants = dispo.filter((e) => {
    const target = e.weekly_hours ?? 38;
    return Number(e.planned_h) < target;
  });
  console.log(`    ${restants.length} avec quota non sature`);

  // sites needs ce jour
  const { rows: needs } = await c.query(
    `select s.code, count(*) as n, sum(headcount) as hc
     from site_needs sn join sites s on s.id = sn.site_id
     where sn.day_of_week = $1 and sn.is_enabled = true
     group by s.code order by s.code`,
    [jsDow],
  );
  for (const n of needs) console.log(`    site ${n.code} : ${n.n} creneaux x ${n.hc} headcount`);
}

// 3) Existant pour cette semaine
const { rows: existing } = await c.query(
  `select s.code as site, count(*) as n
   from shifts sh left join sites s on s.id = sh.site_id
   where sh.date between $1 and $2
   group by s.code order by s.code`,
  [mondayISO, sundayISO],
);
console.log(`\n=== Shifts existants cette semaine ===`);
for (const r of existing) console.log(`  ${r.site ?? "(no site)"} : ${r.n}`);

await c.end();
