// Karim 2026-05-24 : recupere TOUS les slots qui ont pointe sur Pointage A
// (bfd90b87c696ead286zzxm) sur 30 jours. Pour chaque slot : nombre de
// pointages, dernier event, plage horaire typique. Aide a mapper.

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
function hmac(key, msg) { return crypto.createHmac("sha256", key).update(msg, "utf8").digest("hex").toUpperCase(); }
function sortQs(p) { const i = p.indexOf("?"); if (i < 0) return p; const parts = p.slice(i+1).split("&").filter(Boolean); parts.sort((a,b)=>a.split("=")[0].localeCompare(b.split("=")[0])); return p.slice(0,i) + "?" + parts.join("&"); }
function sign(token, method, urlPath) {
  const sp = sortQs(urlPath);
  const t = String(Date.now()), nonce = crypto.randomUUID();
  return { sign: hmac(SECRET, CID + token + t + nonce + `${method}\n${sha256("")}\n\n${sp}`), t, nonce, sp };
}
async function call(token, method, urlPath) {
  const { sign: s, t, nonce, sp } = sign(token, method, urlPath);
  const headers = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce };
  if (token) headers.access_token = token;
  const res = await fetch(BASE + sp, { method, headers });
  const txt = await res.text();
  try { return { status: res.status, json: JSON.parse(txt) }; } catch { return { status: res.status, txt }; }
}

const tokRes = await call("", "GET", "/v1.0/token?grant_type=1");
const tok = tokRes.json?.result?.access_token;
console.log("Token OK\n");

const DEVICES_TO_SCAN = [
  ["bfd90b87c696ead286zzxm", "mon Pointage A actuel"],
  ["bfffc2848a716cdeeeglax", "mon Pointage E actuel"],
  ["bf668eaa15b73d5f56nisa", "mon Pointage C et F actuel"],
  ["bf82afe3706630c4ff2mtp", "ElectroZeyn"],
  ["bf3984c8a5ba98b929cpgs", "Acces Platinum"],
];

const now = Date.now();
const since = now - 30 * 86400_000;

// Resume volumes
console.log("=== Volume unlock events 30j par device ===");
const allByDevice = {};
for (const [id, label] of DEVICES_TO_SCAN) {
  let allLogs = [];
  let lastEventTime = now;
  for (let p = 0; p < 20; p++) {
    const path = `/v1.0/devices/${id}/logs?codes=unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit&end_time=${lastEventTime}&size=50&start_time=${since}&type=7`;
    const r = await call(tok, "GET", path);
    if (!r.json?.success) break;
    const logs = r.json.result?.logs ?? [];
    if (logs.length === 0) break;
    allLogs.push(...logs);
    if (logs.length < 50) break;
    const minTs = Math.min(...logs.map((l) => l.event_time));
    if (minTs >= lastEventTime - 1) break;
    lastEventTime = minTs - 1;
  }
  const uniqueSlots = new Set();
  for (const log of allLogs) {
    const buf = Buffer.from(log.value ?? "", "base64");
    if (buf.length >= 4) uniqueSlots.add(buf.readUInt32BE(0));
  }
  allByDevice[id] = allLogs;
  console.log(`  ${id} (${label.padEnd(40)}) : ${String(allLogs.length).padStart(4)} unlocks, ${String(uniqueSlots.size).padStart(2)} slots uniques`);
}

// Le device avec le plus de slots = Pointage A probable
console.log("\n=== Devices tries par activite ===");
const sortedByActivity = Object.entries(allByDevice).sort((a, b) => b[1].length - a[1].length);

// Pour chaque device, afficher detail
for (const [devId, allLogs] of sortedByActivity) {
  const bySlot = new Map();
  for (const log of allLogs) {
    const buf = Buffer.from(log.value ?? "", "base64");
    if (buf.length < 4) continue;
    const slot = buf.readUInt32BE(0);
    const cur = bySlot.get(slot) ?? { count: 0, lastTs: 0, hours: [] };
    cur.count++;
    if (log.event_time > cur.lastTs) cur.lastTs = log.event_time;
    cur.hours.push(new Date(log.event_time).getHours());
    bySlot.set(slot, cur);
  }
  if (bySlot.size === 0) continue;
  const devLabel = DEVICES_TO_SCAN.find((d) => d[0] === devId)?.[1] ?? "?";
  console.log(`\n--- ${devId} (${devLabel}) : ${bySlot.size} slots, ${allLogs.length} pointages ---`);
  const sortedSlots = [...bySlot.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [slot, info] of sortedSlots.slice(0, 30)) {
    const avgHour = info.hours.reduce((a, h) => a + h, 0) / info.hours.length;
    const last = new Date(info.lastTs).toLocaleString("fr-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    console.log(`  slot ${String(slot).padStart(4)} | ${String(info.count).padStart(3)} pointages | derniere : ${last.padEnd(20)} | ~${avgHour.toFixed(0)}h`);
  }
}

// Skip ancien code de cross mappings
const allLogs = [];

// Aggregate par slot
const bySlot = new Map();
for (const log of allLogs) {
  const buf = Buffer.from(log.value ?? "", "base64");
  if (buf.length < 4) continue;
  const slot = buf.readUInt32BE(0);
  const cur = bySlot.get(slot) ?? { count: 0, firstTs: log.event_time, lastTs: 0, hours: [] };
  cur.count++;
  if (log.event_time < cur.firstTs) cur.firstTs = log.event_time;
  if (log.event_time > cur.lastTs) cur.lastTs = log.event_time;
  const hour = new Date(log.event_time).getHours();
  cur.hours.push(hour);
  bySlot.set(slot, cur);
}

// Check mappings BD
const pgc = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pgc.connect();
const { rows: mappings } = await pgc.query(
  "select tuya_user_id, employee_id, e.full_name as emp_name from tuya_user_mapping m left join employees e on e.id = m.employee_id where tuya_device_id = $1 and m.is_active = true",
  [DEV],
);
const mappedSlots = new Map(mappings.map((m) => [parseInt(m.tuya_user_id), m.emp_name]));
await pgc.end();

// Sort par count desc
const sorted = [...bySlot.entries()].sort((a, b) => b[1].count - a[1].count);

console.log("Slot | Pointages 30j | Dernier event             | Horaire moyen | Mapping actuel");
console.log("-".repeat(95));
for (const [slot, info] of sorted) {
  const avgHour = info.hours.reduce((a, h) => a + h, 0) / info.hours.length;
  const lastDate = new Date(info.lastTs).toLocaleString("fr-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const mapped = mappedSlots.get(slot);
  const mapInfo = mapped ? `✓ ${mapped}` : "✗ non mappé";
  console.log(`${String(slot).padStart(4)} | ${String(info.count).padStart(4)} pointages | ${lastDate.padEnd(25)} | ~${avgHour.toFixed(0)}h          | ${mapInfo}`);
}
