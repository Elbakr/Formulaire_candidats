// Agent : verification finale de l etat post-backfill
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log("=== ETAT FINAL clock_entries mai 2026 (source IN tuya/auto_close) ===");

const tot = await c.query(`
  select count(*) as n,
         count(*) filter (where source='tuya') as tuya_n,
         count(*) filter (where source='auto_close') as auto_n,
         count(*) filter (where kind='in') as in_n,
         count(*) filter (where kind='out') as out_n,
         count(distinct employee_id) as emp_n
  from clock_entries
  where source in ('tuya', 'auto_close')
    and occurred_at between '2026-05-01' and '2026-05-25'
`);
console.log(`Total entries mai : ${tot.rows[0].n} (tuya=${tot.rows[0].tuya_n}, auto_close=${tot.rows[0].auto_n})`);
console.log(`  IN=${tot.rows[0].in_n} OUT=${tot.rows[0].out_n}`);
console.log(`  ${tot.rows[0].emp_n} employees couverts`);

console.log("\n=== Distribution par employee ===");
const dist = await c.query(`
  select e.full_name,
         count(*) filter (where ce.kind='in') as in_n,
         count(*) filter (where ce.kind='out') as out_n,
         count(*) filter (where ce.source='tuya') as tuya_n,
         count(*) filter (where ce.source='auto_close') as auto_n,
         array_agg(distinct ce.occurred_at::date order by ce.occurred_at::date) as days
  from clock_entries ce
  join employees e on e.id = ce.employee_id
  where ce.source in ('tuya', 'auto_close')
    and ce.occurred_at between '2026-05-01' and '2026-05-25'
  group by e.full_name
  order by e.full_name
`);
for (const r of dist.rows) {
  const daysStr = r.days.map(d => d.toISOString().slice(0,10)).join(", ");
  console.log(`  ${r.full_name.padEnd(30)} IN=${r.in_n} OUT=${r.out_n} (tuya=${r.tuya_n}, auto=${r.auto_n}) jours: ${daysStr}`);
}

console.log("\n=== Currently clocked-in (view) ===");
try {
  const ci = await c.query(`select e.full_name, ci.* from clock_currently_in ci join employees e on e.id=ci.employee_id`);
  console.log(`  ${ci.rows.length} actuellement clocked-in`);
  for (const r of ci.rows) console.log(`  ${r.full_name}: ${JSON.stringify(r)}`);
} catch (e) {
  console.log(`  view unavailable: ${e.message}`);
}

console.log("\n=== Mappings actuels Pointage A ===");
const ma = await c.query(`
  select m.tuya_user_id, m.tuya_user_id_alpha, m.direction, e.full_name
  from tuya_user_mapping m join employees e on e.id=m.employee_id
  where m.tuya_device_id='bfb90ad2054971aefatjkh' and m.is_active=true
  order by m.tuya_user_id nulls last
`);
for (const r of ma.rows) {
  console.log(`  slot=${(r.tuya_user_id ?? "?").toString().padEnd(4)} alpha=${(r.tuya_user_id_alpha ?? "-").padEnd(8)} ${r.direction} | ${r.full_name}`);
}

await c.end();
