// Check which events failed (compare Tuya events vs DB entries)
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";
import fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const DEVICE_A = "bfb90ad2054971aefatjkh";

// Load all events from local cache
const eventsA = JSON.parse(fs.readFileSync(resolve(__dirname, "../tmp-bfb90ad2054971aefatjkh-events.json"), "utf8"));

// Load mappings
const m = await c.query(`select tuya_user_id, employee_id, direction, e.full_name from tuya_user_mapping mm join employees e on e.id=mm.employee_id where mm.tuya_device_id=$1 and mm.is_active=true`, [DEVICE_A]);
const slotsMapped = new Set(m.rows.filter(r => r.tuya_user_id).map(r => r.tuya_user_id));

// Load entries
const eRes = await c.query(`select tuya_access_log_id from clock_entries where tuya_device_id=$1 and occurred_at between '2026-05-01' and '2026-05-25'`, [DEVICE_A]);
const inserted = new Set(eRes.rows.map(r => r.tuya_access_log_id));

console.log("Events fetched:", eventsA.length);
console.log("Slots mapped:", slotsMapped.size, [...slotsMapped]);

// Find events that should be inserted (mapped slot) but aren't
const missing = [];
for (const ev of eventsA) {
  const slot = String(ev.uid);
  if (!slotsMapped.has(slot)) continue; // unmapped, skipped
  const id = `${DEVICE_A}_${ev.ts}_${slot}`;
  if (!inserted.has(id)) missing.push(ev);
}
console.log("\nMissing events (mapped slot but no entry):");
for (const ev of missing) {
  const mapping = m.rows.find(x => x.tuya_user_id === String(ev.uid));
  console.log(`  ${ev.iso} slot=${ev.uid} -> ${mapping?.full_name ?? "?"}`);
}

// Same for E
const DEVICE_E = "bfd90b87c696ead286zzxm";
const eventsE = JSON.parse(fs.readFileSync(resolve(__dirname, "../tmp-bfd90b87c696ead286zzxm-events.json"), "utf8"));
const mE = await c.query(`select tuya_user_id, employee_id, direction, e.full_name from tuya_user_mapping mm join employees e on e.id=mm.employee_id where mm.tuya_device_id=$1 and mm.is_active=true`, [DEVICE_E]);
const slotsMappedE = new Set(mE.rows.filter(r => r.tuya_user_id).map(r => r.tuya_user_id));
const eResE = await c.query(`select tuya_access_log_id from clock_entries where tuya_device_id=$1 and occurred_at between '2026-05-01' and '2026-05-25'`, [DEVICE_E]);
const insertedE = new Set(eResE.rows.map(r => r.tuya_access_log_id));
const missingE = [];
for (const ev of eventsE) {
  const slot = String(ev.uid);
  if (!slotsMappedE.has(slot)) continue;
  const id = `${DEVICE_E}_${ev.ts}_${slot}`;
  if (!insertedE.has(id)) missingE.push(ev);
}
console.log("\nMissing events on E (mapped slot but no entry):");
for (const ev of missingE) {
  const mapping = mE.rows.find(x => x.tuya_user_id === String(ev.uid));
  console.log(`  ${ev.iso} slot=${ev.uid} -> ${mapping?.full_name ?? "?"}`);
}

await c.end();
