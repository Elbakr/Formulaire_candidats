// Karim 2026-05-24 : diag des 5 presents fantomes - qui est marque present
// alors qu il est parti. Identifie le dernier event de chacun.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log("=== clock_currently_in (presents declares) ===");
const present = await c.query(`
  select ci.employee_id, ci.clock_in_at, ci.site_id, ci.site_code, ci.site_name,
         e.full_name
  from clock_currently_in ci
  left join employees e on e.id = ci.employee_id
  order by ci.clock_in_at desc
`);
console.log(`Total : ${present.rows.length}`);
for (const r of present.rows) {
  const dur = Math.round((Date.now() - new Date(r.clock_in_at).getTime()) / 3600_000);
  console.log(`  ${r.full_name ?? "?"} | IN depuis ${r.clock_in_at.toISOString().slice(0,16)} (${dur}h) | site=${r.site_code ?? "?"}`);
}

console.log("\n=== Derniers events de chacun (5 lignes par employee) ===");
for (const p of present.rows) {
  console.log(`\n--- ${p.full_name} (${p.employee_id?.slice(0,8)}) ---`);
  const ev = await c.query(`
    select kind, occurred_at, source, tuya_device_id, tuya_user_id, entry_method, auto_clocked_out
    from clock_entries
    where employee_id = $1
    order by occurred_at desc
    limit 8
  `, [p.employee_id]);
  for (const e of ev.rows) {
    console.log(`  ${e.occurred_at.toISOString().slice(0,16)} | ${e.kind.toUpperCase()} | src=${e.source} | dev=${e.tuya_device_id?.slice(0,10) ?? "—"} | uid=${e.tuya_user_id ?? "—"} | method=${e.entry_method} | auto=${e.auto_clocked_out}`);
  }
}

await c.end();
