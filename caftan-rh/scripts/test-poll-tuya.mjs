// Karim 2026-05-24 : lance le poll Tuya en simulant exactement pollTuyaLogs
// avec lookback 7 jours, pour identifier les bugs eventuels.

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

function parseUnlockValue(b64, code) {
  const buf = Buffer.from(b64 ?? "", "base64");
  if (code && code.endsWith("_kit") && buf.length >= 4) {
    return { method_label: code.replace("unlock_", "").replace("_kit", ""), user_id_in_device: buf.readUInt32BE(0) };
  }
  if (buf.length >= 12) return { method: buf[1], user_id_in_device: buf.readUInt32BE(8) };
  return {};
}

const tokRes = await call("", "GET", "/v1.0/token?grant_type=1");
const tok = tokRes.json?.result?.access_token;
console.log("Token OK\n");

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: devices } = await c.query(
  "select tuya_device_id, tuya_device_name, site_id, fallback_for_site_ids from tuya_devices where is_active = true and is_pointage = true"
);
const { rows: mappings } = await c.query(
  "select id, tuya_device_id, tuya_user_id, employee_id, direction, is_active from tuya_user_mapping where is_active = true"
);
console.log(`Devices pointage : ${devices.length}, Mappings actifs : ${mappings.length}\n`);

const now = Date.now();
const since = now - 7 * 86400_000; // 7 jours
let totalFetched = 0, matched = 0, unmatched = 0, errors = 0;
const matchesByDev = {};

for (const dev of devices) {
  const path = `/v1.0/devices/${dev.tuya_device_id}/logs?codes=unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit&end_time=${now}&size=50&start_time=${since}&type=7`;
  const r = await call(tok, "GET", path);
  if (!r.json?.success) {
    console.log(`✗ ${dev.tuya_device_name} : code=${r.json?.code} msg="${r.json?.msg}"`);
    errors++; continue;
  }
  const logs = r.json.result?.logs ?? [];
  totalFetched += logs.length;
  let devMatches = 0;
  for (const log of logs) {
    const parsed = parseUnlockValue(log.value, log.code);
    const uid = parsed.user_id_in_device;
    if (uid == null) continue;
    const map = mappings.find((m) => m.tuya_device_id === dev.tuya_device_id && m.tuya_user_id === String(uid));
    if (map) {
      devMatches++;
      matched++;
    } else {
      unmatched++;
    }
  }
  matchesByDev[dev.tuya_device_name] = `${devMatches}/${logs.length} events mappes`;
}

console.log("\n=== Resume ===");
console.log(`Events fetched : ${totalFetched}`);
console.log(`Matches mapping : ${matched}`);
console.log(`Sans mapping : ${unmatched}`);
console.log(`Erreurs : ${errors}`);
console.log("\nPar device :");
for (const [name, info] of Object.entries(matchesByDev)) console.log(`  ${name}: ${info}`);

await c.end();
