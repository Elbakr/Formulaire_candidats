// Karim 2026-05-24 : diag Rekimi marquee presente 83h alors qu absente.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log("=== clock_currently_in ===");
const ci = await c.query(`
  select ci.*, e.full_name from clock_currently_in ci
  left join employees e on e.id = ci.employee_id
  order by ci.clock_in_at desc
`);
for (const r of ci.rows) {
  const dur = Math.round((Date.now() - new Date(r.clock_in_at).getTime()) / 3600_000);
  console.log(`  ${r.full_name} (${r.employee_id?.slice(0,8)}) | IN ${r.clock_in_at.toISOString().slice(0,16)} (${dur}h) | last_entry=${r.last_entry_id?.slice(0,8)}`);
}

console.log("\n=== Rekimi : tous events 10 derniers ===");
const ev = await c.query(`
  select id, kind, occurred_at, source, tuya_device_id, tuya_user_id, entry_method
  from clock_entries
  where employee_id = 'a52ca977-fbb9-4d83-a193-7f1da6d76b13'
  order by occurred_at desc
  limit 10
`);
console.log(`Total : ${ev.rows.length}`);
for (const r of ev.rows) {
  console.log(`  ${r.occurred_at.toISOString().slice(0,16)} | ${r.kind.toUpperCase()} | src=${r.source} | dev=${r.tuya_device_id?.slice(0,10)} | uid=${r.tuya_user_id} | entry=${r.entry_method}`);
}

await c.end();
