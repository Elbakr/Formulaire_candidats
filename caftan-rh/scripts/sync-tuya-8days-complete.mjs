// Karim 2026-05-25 : extraction COMPLETE des 8 derniers jours Tuya.
// Pour chaque device pointage actif :
//   - Fetch tous les events via pagination has_next
//   - Pour chaque event : check si tuya_access_log_id deja en clock_entries
//   - Si manquant : insert avec mapping resolu (slot ou alpha)
//   - Rapport : par employee × jour, ce qui est present vs manquant

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const BASE = process.env.TUYA_BASE_URL ?? "https://openapi.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";

function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(k, m) { return crypto.createHmac("sha256", k).update(m, "utf8").digest("hex").toUpperCase(); }
function sortQs(p) { const i = p.indexOf("?"); if (i < 0) return p; const ps = p.slice(i+1).split("&").filter(Boolean); ps.sort((a,b)=>a.split("=")[0].localeCompare(b.split("=")[0])); return p.slice(0,i)+"?"+ps.join("&"); }
function sign(tok, m, u) { const sp = sortQs(u); const t = String(Date.now()), n = crypto.randomUUID(); return { s: hmac(SECRET, CID+tok+t+n+`${m}\n${sha256("")}\n\n${sp}`), t, n, sp }; }
async function call(tok, m, u) {
  const { s, t, n, sp } = sign(tok, m, u);
  const h = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce: n };
  if (tok) h.access_token = tok;
  const r = await fetch(BASE + sp, { method: m, headers: h });
  return await r.json();
}

function parseUnlockValue(b64, code) {
  const buf = Buffer.from(b64 ?? "", "base64");
  if (code?.endsWith("_kit") && buf.length >= 4) {
    return { method: code.replace("unlock_", "").replace("_kit", ""), userIdLocal: buf.readUInt32BE(0) };
  }
  if (buf.length >= 12) {
    return { method: "lock_method", userIdLocal: buf.readUInt32BE(8) };
  }
  return { method: null, userIdLocal: null };
}

const tok = (await call("", "GET", "/v1.0/token?grant_type=1")).result.access_token;
console.log("Token Tuya OK\n");

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: devices } = await c.query(
  "select tuya_device_id, tuya_device_name, site_id, fallback_for_site_ids from tuya_devices where is_active and is_pointage",
);
const { rows: mappings } = await c.query(
  "select tuya_device_id, tuya_user_id, tuya_user_id_alpha, employee_id from tuya_user_mapping where is_active",
);
const mappingBySlot = new Map();
for (const m of mappings) {
  if (m.tuya_user_id) mappingBySlot.set(`${m.tuya_device_id}|${m.tuya_user_id}`, m);
}

const { rows: existingEntries } = await c.query(
  "select tuya_access_log_id from clock_entries where occurred_at >= now() - interval '9 days' and tuya_access_log_id is not null",
);
const existingIds = new Set(existingEntries.map(r => r.tuya_access_log_id));
console.log(`En BD : ${existingIds.size} clock_entries (9 derniers jours) avec tuya_access_log_id\n`);

const now = Date.now();
const since = now - 8 * 86400_000;

let totalFetched = 0, totalAlreadyIn = 0, totalInserted = 0, totalUnmapped = 0;
const missingByDate = new Map();
const unmappedSlots = new Map();

for (const dev of devices) {
  console.log(`\n=== ${dev.tuya_device_name} ===`);
  let rowKey = "";
  const events = [];
  for (let page = 0; page < 50; page++) {
    let path = `/v1.0/devices/${dev.tuya_device_id}/logs?codes=unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit&end_time=${now}&size=50&start_time=${since}&type=7`;
    if (rowKey) path += `&start_row_key=${encodeURIComponent(rowKey)}`;
    const r = await call(tok, "GET", path);
    if (!r.success) { console.log(`  Page ${page+1} ECHEC: ${r.code}`); break; }
    const lst = r.result?.logs ?? [];
    events.push(...lst);
    if (!r.result.has_next || !r.result.next_row_key || lst.length === 0) break;
    rowKey = r.result.next_row_key;
  }
  totalFetched += events.length;
  console.log(`  ${events.length} events fetched`);

  for (const ev of events) {
    const parsed = parseUnlockValue(ev.value, ev.code);
    if (parsed.userIdLocal == null) continue;
    const slot = String(parsed.userIdLocal);
    const accessId = `${dev.tuya_device_id}_${ev.event_time}_${slot}`;

    if (existingIds.has(accessId)) { totalAlreadyIn++; continue; }

    const mapping = mappingBySlot.get(`${dev.tuya_device_id}|${slot}`);
    if (!mapping) {
      totalUnmapped++;
      const k = `${dev.tuya_device_id}|${slot}`;
      unmappedSlots.set(k, (unmappedSlots.get(k) ?? 0) + 1);
      continue;
    }

    const date = new Date(ev.event_time).toISOString().slice(0, 10);
    const dayStart = new Date(`${date}T00:00:00Z`).toISOString();
    const { rows: prior } = await c.query(
      "select id from clock_entries where employee_id=$1 and occurred_at >= $2 and occurred_at < $3",
      [mapping.employee_id, dayStart, new Date(ev.event_time).toISOString()],
    );
    const inferredKind = prior.length % 2 === 0 ? "in" : "out";

    const occurredAt = new Date(ev.event_time).toISOString();
    try {
      await c.query(
        `insert into clock_entries
         (employee_id, shift_id, site_id, kind, occurred_at, entry_method, source, tuya_device_id, tuya_user_id, tuya_access_log_id, notes)
         values ($1, null, $2, $3, $4, 'tap', 'tuya', $5, $6, $7, $8)
         on conflict (tuya_access_log_id) do nothing`,
        [mapping.employee_id, dev.site_id, inferredKind, occurredAt, dev.tuya_device_id, slot, accessId, `Tuya ${parsed.method} (sync 8j) kind=${inferredKind}`],
      );
      totalInserted++;
      existingIds.add(accessId);
      const { rows: empName } = await c.query("select full_name from employees where id=$1", [mapping.employee_id]);
      const key = `${empName[0]?.full_name ?? "?"}|${date}`;
      missingByDate.set(key, (missingByDate.get(key) ?? 0) + 1);
    } catch (e) {
      // trigger violation : continue
    }
  }
}

console.log(`\n=== RESUME ===`);
console.log(`Fetched : ${totalFetched}`);
console.log(`Deja en BD : ${totalAlreadyIn}`);
console.log(`Nouveaux inserts : ${totalInserted}`);
console.log(`Skipped no_mapping : ${totalUnmapped}`);

if (missingByDate.size > 0) {
  console.log(`\n=== EVENTS INSERES (par employee × jour) ===`);
  for (const [key, count] of [...missingByDate.entries()].sort()) {
    console.log(`  ${key} : ${count}`);
  }
}

if (unmappedSlots.size > 0) {
  console.log(`\n=== Slots NON MAPPES (a enroler via /admin/tuya/logs) ===`);
  for (const [k, count] of [...unmappedSlots.entries()].sort()) {
    const [dev, slot] = k.split("|");
    const devName = devices.find(d => d.tuya_device_id === dev)?.tuya_device_name ?? "?";
    console.log(`  ${devName} slot ${slot} : ${count} events`);
  }
}

await c.end();
