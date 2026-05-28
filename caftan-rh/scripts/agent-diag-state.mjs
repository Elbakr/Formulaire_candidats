// Agent autonome 2026-05-24 : diag complet etat actuel
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const DEVICE_A = "bfb90ad2054971aefatjkh";
const DEVICE_E = "bfd90b87c696ead286zzxm";

console.log("=== Devices actifs is_pointage ===");
const d = await c.query(
  `select tuya_device_id, tuya_device_name, site_id, fallback_for_site_ids, is_pointage, is_active from tuya_devices where is_active=true order by tuya_device_name`,
);
for (const r of d.rows) console.log(`  ${r.tuya_device_id} | "${r.tuya_device_name}" | site=${r.site_id} | fb=${JSON.stringify(r.fallback_for_site_ids)} | pointage=${r.is_pointage}`);

console.log("\n=== Mappings Pointage A ===");
const ma = await c.query(
  `select m.tuya_user_id, m.tuya_user_id_alpha, m.employee_id, m.direction, m.tuya_name, m.is_active, e.full_name
     from tuya_user_mapping m left join employees e on e.id=m.employee_id
    where tuya_device_id=$1 order by tuya_user_id_alpha nulls last, tuya_user_id nulls last, direction`,
  [DEVICE_A],
);
for (const r of ma.rows) {
  console.log(`  ${r.is_active ? "OK" : "XX"} slot=${(r.tuya_user_id ?? "?").toString().padEnd(4)} alpha=${(r.tuya_user_id_alpha ?? "-").padEnd(12)} ${r.direction.toUpperCase()} emp=${(r.employee_id ?? "").slice(0,8)} | ${r.full_name ?? "-"} | "${r.tuya_name ?? ""}"`);
}
console.log(`Total A : ${ma.rows.length}`);

console.log("\n=== Mappings Pointage E ===");
const me = await c.query(
  `select m.tuya_user_id, m.tuya_user_id_alpha, m.employee_id, m.direction, m.tuya_name, m.is_active, e.full_name
     from tuya_user_mapping m left join employees e on e.id=m.employee_id
    where tuya_device_id=$1 order by tuya_user_id::int nulls last, direction`,
  [DEVICE_E],
);
for (const r of me.rows) {
  console.log(`  ${r.is_active ? "OK" : "XX"} slot=${(r.tuya_user_id ?? "?").toString().padEnd(4)} alpha=${(r.tuya_user_id_alpha ?? "-").padEnd(12)} ${r.direction.toUpperCase()} emp=${(r.employee_id ?? "").slice(0,8)} | ${r.full_name ?? "-"} | "${r.tuya_name ?? ""}"`);
}
console.log(`Total E : ${me.rows.length}`);

console.log("\n=== Employees actifs (CaftanRH) ===");
const ea = await c.query(`select id, full_name, email, status from employees where status='active' order by full_name`);
for (const r of ea.rows) console.log(`  ${r.id.slice(0,8)} | ${r.full_name.padEnd(30)} | ${r.email}`);
console.log(`Total actifs : ${ea.rows.length}`);

console.log("\n=== Sites ===");
const s = await c.query(`select id, code, name from sites order by code`);
for (const r of s.rows) console.log(`  ${r.id.slice(0,8)} | ${r.code} | ${r.name}`);

console.log("\n=== Tuya sync state ===");
const ts = await c.query(`select id, last_log_access_time, last_sync_at, last_error from tuya_sync_state order by id`);
for (const r of ts.rows) {
  const ts2 = r.last_log_access_time ? new Date(Number(r.last_log_access_time)).toISOString() : null;
  console.log(`  ${r.id} | last_log=${ts2} | last_sync=${r.last_sync_at ? r.last_sync_at.toISOString() : null} | err=${r.last_error ?? "-"}`);
}

console.log("\n=== clock_entries source=tuya (mai 2026) ===");
const ce = await c.query(`
  select count(*) as n,
         min(occurred_at) as first_at,
         max(occurred_at) as last_at,
         count(distinct employee_id) as emp_count
  from clock_entries
  where source='tuya' and occurred_at >= '2026-05-01' and occurred_at < '2026-05-25'
`);
console.log(`  Total tuya mai : ${ce.rows[0].n} | from ${ce.rows[0].first_at?.toISOString() ?? "-"} to ${ce.rows[0].last_at?.toISOString() ?? "-"} | ${ce.rows[0].emp_count} employees`);

console.log("\n=== Distribution clock_entries par employee (mai) ===");
const dist = await c.query(`
  select e.full_name, count(*) filter (where ce.kind='in') as in_n, count(*) filter (where ce.kind='out') as out_n
  from clock_entries ce
  join employees e on e.id = ce.employee_id
  where ce.source='tuya' and ce.occurred_at >= '2026-05-01' and ce.occurred_at < '2026-05-25'
  group by e.full_name
  order by e.full_name
`);
for (const r of dist.rows) console.log(`  ${r.full_name.padEnd(30)} IN=${r.in_n} OUT=${r.out_n}`);

await c.end();
