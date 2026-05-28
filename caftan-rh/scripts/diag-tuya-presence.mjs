// Karim 2026-05-24 : diagnostic complet pour comprendre pourquoi /admin/presence
// affiche 0 presents alors qu il y a des unlock events Tuya.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log("=== tuya_user_mapping ===");
const m = await c.query("select id, tuya_device_id, tuya_user_id, employee_id, direction, is_active, tuya_name from tuya_user_mapping order by created_at desc");
console.log(`Total : ${m.rows.length}`);
for (const r of m.rows) {
  console.log(`  ${r.is_active ? "✓" : "✗"} ${r.tuya_device_id?.slice(0,10)} | uid=${r.tuya_user_id} ${r.direction.toUpperCase()} | emp=${r.employee_id?.slice(0,8)} | "${r.tuya_name ?? ""}"`);
}

console.log("\n=== clock_entries source='tuya' (10 dernieres) ===");
const ce = await c.query(`
  select id, employee_id, kind, occurred_at, source, tuya_device_id, tuya_user_id, site_id, shift_id
  from clock_entries
  where source = 'tuya'
  order by occurred_at desc
  limit 10
`);
console.log(`Total source=tuya : ${ce.rows.length}`);
for (const r of ce.rows) {
  console.log(`  ${r.occurred_at.toISOString().slice(0,16)} | ${r.kind.toUpperCase()} | emp=${r.employee_id?.slice(0,8)} | dev=${r.tuya_device_id?.slice(0,10)} | uid=${r.tuya_user_id}`);
}

console.log("\n=== Tous clock_entries des 24 dernieres heures (toutes sources) ===");
const all = await c.query(`
  select count(*) as cnt, source
  from clock_entries
  where occurred_at > now() - interval '24 hours'
  group by source
`);
for (const r of all.rows) console.log(`  ${r.source}: ${r.cnt}`);

console.log("\n=== clock_currently_in (qui est clocke IN actuellement) ===");
const ci = await c.query("select count(*) from clock_currently_in");
console.log(`Total clocked-in: ${ci.rows[0].count}`);
if (parseInt(ci.rows[0].count) > 0) {
  const list = await c.query("select * from clock_currently_in limit 5");
  for (const r of list.rows) console.log(`  ${JSON.stringify(r).slice(0, 200)}`);
}

console.log("\n=== Sites C/F (Anvers) ===");
const sites = await c.query("select id, code, name, is_active from sites where code in ('C', 'F') order by code");
for (const r of sites.rows) console.log(`  ${r.code} | ${r.name} | active=${r.is_active}`);

await c.end();
