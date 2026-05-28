// Karim 2026-05-24 : simule fetchTuyaLogsAction de bout en bout pour
// reproduire ce que devrait afficher /admin/tuya/logs.
// Si ce script retourne des events, c est que le dev server doit etre redemarre.

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
  if (buf.length >= 12) {
    return { method: buf[1], user_id_in_device: buf.readUInt32BE(8) };
  }
  return {};
}

// 1. Token Tuya
const tokRes = await call("", "GET", "/v1.0/token?grant_type=1");
const tok = tokRes.json?.result?.access_token;
console.log("Token Tuya OK\n");

// 2. Devices pointage actifs depuis BDD
const pgc = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pgc.connect();
const { rows: devices } = await pgc.query(
  "select tuya_device_id, tuya_device_name from tuya_devices where is_active = true and is_pointage = true"
);
console.log(`Devices pointage actifs en BDD : ${devices.length}`);
for (const d of devices) console.log(`  - ${d.tuya_device_id} | ${d.tuya_device_name}`);

// 3. Mappings
const { rows: mappings } = await pgc.query(
  "select tuya_device_id, tuya_user_id, employee_id, direction, is_active from tuya_user_mapping where is_active = true"
);
console.log(`\nMappings actifs : ${mappings.length}`);

await pgc.end();

// 4. Pour chaque device, fetch les unlock logs sur 24h avec les BONS codes
const now = Date.now();
const since = now - 24 * 3600_000;
console.log(`\nFetch unlock logs (24h derniere) avec codes unlock_*_kit :\n`);

let totalLogs = 0;
for (const dev of devices) {
  const path = `/v1.0/devices/${dev.tuya_device_id}/logs?codes=unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit&end_time=${now}&size=50&start_time=${since}&type=7`;
  const r = await call(tok, "GET", path);
  if (!r.json?.success) {
    console.log(`✗ ${dev.tuya_device_name}: code=${r.json?.code} msg="${r.json?.msg?.slice(0,40)}"`);
    continue;
  }
  const logs = r.json.result?.logs ?? [];
  totalLogs += logs.length;
  console.log(`${logs.length === 0 ? "  " : "✓ "}${dev.tuya_device_name} (${dev.tuya_device_id}) : ${logs.length} unlock event(s)`);
  for (const log of logs) {
    const parsed = parseUnlockValue(log.value, log.code);
    const time = new Date(log.event_time).toLocaleString("fr-BE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
    console.log(`    ${time} | code=${log.code} | tuya_user_id=${parsed.user_id_in_device ?? "?"} | method=${parsed.method_label ?? "?"}`);
  }
}

console.log(`\nTOTAL : ${totalLogs} unlock event(s) sur 24h`);
if (totalLogs > 0) {
  console.log("\n→ Si l UI /admin/tuya/logs reste vide, REDEMARRE le dev server (Ctrl+C puis npm run dev)");
  console.log("  car les modifications de tuya-client.ts ne sont pas appliquees a chaud.");
}
