// Karim 2026-05-24 : diagnostic post-migration 406. Verifie :
// - 14 mappings sur Pointage A (bfb90ad2054971aefatjkh)
// - 4 nouveaux employees crees (Aya, Hajar, Assya, Chaymae)
// - site_assignments Site A pour les 4 nouveaux

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const DEVICE = "bfb90ad2054971aefatjkh";

console.log("=== Mappings sur Pointage A (" + DEVICE + ") ===");
const m = await c.query(
  `select tuya_user_id, tuya_user_id_alpha, employee_id, direction, tuya_name, is_active
     from tuya_user_mapping
    where tuya_device_id = $1
    order by tuya_user_id_alpha nulls last, direction`,
  [DEVICE],
);
console.log(`Total : ${m.rows.length} (attendu : 14 nouveaux + 3 anciens OUT = 17, ou >= 14)`);
for (const r of m.rows) {
  const slot = r.tuya_user_id != null ? `slot=${r.tuya_user_id}` : "slot=?";
  const alpha = r.tuya_user_id_alpha ? `alpha=${r.tuya_user_id_alpha}` : "";
  console.log(`  ${r.is_active ? "OK" : "XX"} ${slot.padEnd(10)} ${alpha.padEnd(15)} ${r.direction.toUpperCase()} | emp=${r.employee_id?.slice(0, 8)} | "${r.tuya_name ?? ""}"`);
}

console.log("\n=== 4 nouveaux employees (Aya, Hajar, Assya, Chaymae) ===");
const e = await c.query(`
  select id, email, full_name, status, start_date
  from employees
  where email like 'tuya-%@local.caftanrh'
  order by full_name
`);
for (const r of e.rows) {
  console.log(`  ${r.full_name.padEnd(10)} | ${r.email} | status=${r.status}`);
}
console.log(`Total : ${e.rows.length} (attendu : 4)`);

console.log("\n=== Site assignments des 4 nouveaux ===");
const sa = await c.query(`
  select e.full_name, s.code as site_code, sa.is_primary, sa.start_date, sa.end_date
  from site_assignments sa
  join employees e on e.id = sa.employee_id
  join sites s on s.id = sa.site_id
  where e.email like 'tuya-%@local.caftanrh'
  order by e.full_name
`);
for (const r of sa.rows) {
  console.log(`  ${r.full_name.padEnd(10)} | Site ${r.site_code} | primary=${r.is_primary} | ${r.start_date.toISOString().slice(0, 10)}${r.end_date ? "-" + r.end_date.toISOString().slice(0, 10) : ""}`);
}
console.log(`Total : ${sa.rows.length} (attendu : 4)`);

console.log("\n=== Employees actifs total ===");
const ea = await c.query(`select count(*) from employees where status = 'active'`);
console.log(`Total actifs : ${ea.rows[0].count}`);

console.log("\n=== Contraintes tuya_user_mapping ===");
const cn = await c.query(`
  select conname, contype, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'tuya_user_mapping'::regclass
  order by contype, conname
`);
for (const r of cn.rows) {
  console.log(`  [${r.contype}] ${r.conname} : ${r.def}`);
}

console.log("\n=== Mappings par device (recap) ===");
const ag = await c.query(`
  select tuya_device_id, count(*) as cnt,
         count(*) filter (where tuya_user_id is null) as null_slots,
         count(*) filter (where tuya_user_id_alpha is not null) as with_alpha
  from tuya_user_mapping
  group by tuya_device_id
  order by tuya_device_id
`);
for (const r of ag.rows) {
  console.log(`  ${r.tuya_device_id} : ${r.cnt} mappings | ${r.null_slots} sans slot | ${r.with_alpha} avec alpha`);
}

await c.end();
