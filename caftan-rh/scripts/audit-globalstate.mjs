// Audit complet de l'etat de l'app : anomalies DB, donnees orphelines, etc.
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

const issues = [];
function report(severity, area, msg, detail) {
  issues.push({ severity, area, msg, detail });
}

// 1) Employes actifs sans site
const { rows: noSite } = await c.query(`
  select e.full_name from employees e
  where e.status='active' and not exists (
    select 1 from site_assignments a where a.employee_id=e.id
      and a.start_date <= current_date and (a.end_date is null or a.end_date >= current_date)
  )
`);
if (noSite.length > 0) report("warn", "Employes", `${noSite.length} actifs sans site`, noSite.map(r=>r.full_name).join(", "));

// 2) Shifts orphelins (site_id null)
const { rows: orphanShifts } = await c.query(`
  select count(*) as n from shifts where site_id is null and date >= current_date - 7
`);
if (orphanShifts[0].n > 0) report("warn", "Shifts", `${orphanShifts[0].n} shifts SANS site (semaine recente)`);

// 3) Quotas en depassement (cette semaine)
const { rows: quotaOver } = await c.query(`
  with weekly as (
    select e.id, e.full_name, e.weekly_hours,
      coalesce(sum(case when s.is_overtime=false then
        (extract(epoch from (s.end_time - s.start_time)) - coalesce(s.break_minutes,0)*60)/3600 end), 0) as h
    from employees e
    left join shifts s on s.employee_id = e.id and s.date >= date_trunc('week', current_date)
      and s.date <= date_trunc('week', current_date) + interval '6 days'
    where e.status='active' group by e.id, e.full_name, e.weekly_hours
  )
  select full_name, weekly_hours, h::numeric(10,1) from weekly where h > weekly_hours + 0.5
`);
if (quotaOver.length > 0) report("warn", "Quotas", `${quotaOver.length} employes en depassement non-OT`, quotaOver.map(r=>`${r.full_name} ${r.h}h/${r.weekly_hours}h`).join(", "));

// 4) Clock-in sans clock-out (anomalie)
const { rows: stale } = await c.query(`
  select e.full_name, c.occurred_at::text as t
  from clock_entries c
  join employees e on e.id = c.employee_id
  where c.kind = 'in' and c.occurred_at > now() - interval '7 days'
  and not exists (
    select 1 from clock_entries c2 where c2.employee_id = c.employee_id and c2.occurred_at > c.occurred_at
  )
`);
if (stale.length > 0) report("warn", "Pointage", `${stale.length} clock-in sans clock-out`, stale.map(r=>`${r.full_name} ${r.t.slice(0,16)}`).join(" / "));

// 5) Doublons shifts (employee, date, start_time)
const { rows: dupShifts } = await c.query(`
  select employee_id, date::text as d, start_time, count(*) as n
  from shifts where date >= current_date - 7
  group by employee_id, date, start_time having count(*) > 1
`);
if (dupShifts.length > 0) report("critical", "Shifts", `${dupShifts.length} doublons (meme employe/date/heure)`);

// 6) Push subscriptions
const { rows: pushSubs } = await c.query(`select count(*) as n from push_subscriptions where is_active=true`);
report(pushSubs[0].n === 0 ? "info" : "ok", "Push", `${pushSubs[0].n} subscriptions actives`);

// 7) Drafts auto en attente
const { rows: pendingDrafts } = await c.query(`
  select count(*) as n from auto_plan_drafts where status='pending' and generated_at > now() - interval '7 days'
`);
if (pendingDrafts[0].n > 0) report("info", "Auto-plan", `${pendingDrafts[0].n} drafts en attente d'approbation`);

// 8) Holidays a venir (30j)
const { rows: hols } = await c.query(`
  select count(*) as n_special, count(case when shops_closed then 1 end) as n_closed
  from holidays where is_active and date between current_date and current_date + 30
`);
report("ok", "Calendrier", `${hols[0].n_special} feries dans 30j (${hols[0].n_closed} avec magasins fermes)`);

// 9) Cron config (vercel.json) vs DB notifications recentes
const { rows: cronNotifs } = await c.query(`
  select kind, count(*) as n, max(created_at)::text as last
  from notifications where created_at > now() - interval '3 days'
  group by kind order by last desc
`);
report("info", "Notifications", `${cronNotifs.length} kinds actifs ces 3j`, cronNotifs.map(r=>`${r.kind}:${r.n}`).join(", "));

// 10) Tables totales + count rows critiques
const { rows: counts } = await c.query(`
  select 'employees actifs' as t, count(*) as n from employees where status='active'
  union all select 'sites actifs', count(*) from sites where is_active=true
  union all select 'shifts (30j)', count(*) from shifts where date >= current_date - 30 and date <= current_date + 30
  union all select 'site_needs enabled', count(*) from site_needs where is_enabled=true
  union all select 'candidates', count(*) from candidates
  union all select 'applications', count(*) from applications
`);

console.log("\n=== AUDIT GLOBAL CAFTAN-RH ===\n");
console.log("📊 Comptages :");
for (const r of counts) console.log(`  ${r.t.padEnd(25)} ${r.n}`);

console.log("\n🔍 Issues detectees :");
const byLevel = { critical: [], warn: [], info: [], ok: [] };
for (const i of issues) byLevel[i.severity].push(i);
for (const lvl of ["critical", "warn", "info", "ok"]) {
  if (byLevel[lvl].length === 0) continue;
  console.log(`\n  ${lvl.toUpperCase()} (${byLevel[lvl].length}) :`);
  for (const i of byLevel[lvl]) {
    console.log(`    [${i.area}] ${i.msg}`);
    if (i.detail) console.log(`      -> ${i.detail.substring(0, 200)}`);
  }
}

await c.end();
