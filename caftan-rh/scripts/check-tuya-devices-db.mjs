// Karim 2026-05-24 : verifie le contenu de tuya_devices en BDD pour
// debugguer l UI qui affiche 0 terminaux.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const url = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

console.log("=== _caftanrh_migrations (10 derniers) ===");
const m = await client.query("select filename, applied_at from _caftanrh_migrations order by filename desc limit 10");
for (const r of m.rows) console.log(`  ${r.applied_at.toISOString().slice(0,10)} ${r.filename}`);

console.log("\n=== Structure tuya_devices ===");
const cols = await client.query("select column_name, data_type, is_nullable from information_schema.columns where table_name='tuya_devices' order by ordinal_position");
for (const c of cols.rows) console.log(`  ${c.column_name} : ${c.data_type} ${c.is_nullable === 'NO' ? 'NOT NULL' : ''}`);

console.log("\n=== Contenu tuya_devices ===");
const rows = await client.query("select tuya_device_id, tuya_device_name, category, is_pointage, is_active, site_id, fallback_for_site_ids, notes from tuya_devices order by is_pointage desc, tuya_device_name");
console.log(`  Total : ${rows.rows.length} rows`);
for (const r of rows.rows) {
  console.log(`  - ${r.tuya_device_id} | ${r.tuya_device_name} | cat=${r.category} | pointage=${r.is_pointage} | active=${r.is_active} | site=${r.site_id?.slice(0,8) ?? "NULL"}`);
}

await client.end();
