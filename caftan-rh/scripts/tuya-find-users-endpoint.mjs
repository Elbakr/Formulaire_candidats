// Karim 2026-05-24 : essaye 10 endpoints Tuya differents pour recuperer la
// liste des USERS enrôlés sur un terminal access control LCD (avec leur NOM,
// pas juste l ID). But : auto-mapping par nom au lieu de saisie manuelle.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

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

const DEV = "bf668eaa15b73d5f56nisa"; // Pointage C et F (le + utilise, plein d empreintes)

const ENDPOINTS = [
  ["GET", `/v1.0/devices/${DEV}/users`],
  ["GET", `/v1.0/iot-03/devices/${DEV}/users`],
  ["GET", `/v2.0/cloud/thing/${DEV}/users`],
  ["GET", `/v1.0/access-control/devices/${DEV}/users`],
  ["GET", `/v1.0/access-control/users/${DEV}`],
  ["GET", `/v1.0/access-control/cards/${DEV}`],
  ["GET", `/v1.0/access-control/passwords/${DEV}`],
  ["GET", `/v1.0/access-control/fingerprints/${DEV}`],
  ["GET", `/v1.0/access-control/devices/${DEV}/permissions`],
  ["GET", `/v1.0/iot-03/access-control/devices/${DEV}/users`],
  ["GET", `/v1.0/iot-04/devices/${DEV}/users`],
  ["GET", `/v2.0/cloud/access-control/users?device_id=${DEV}`],
  ["GET", `/v1.0/cloud/access-control/devices/${DEV}/users`],
  ["GET", `/v1.0/devices/${DEV}/users?page_no=1&page_size=50`],
  ["GET", `/v1.0/users/devices/${DEV}`],
];

for (const [method, path] of ENDPOINTS) {
  const r = await call(tok, method, path);
  if (r.json?.success) {
    const result = r.json.result;
    if (Array.isArray(result)) {
      console.log(`✓ ${path}`);
      console.log(`  → ${result.length} item(s)`);
      if (result.length > 0) console.log(`  → first: ${JSON.stringify(result[0]).slice(0, 300)}`);
    } else if (result?.list) {
      console.log(`✓ ${path}`);
      console.log(`  → list len=${result.list.length}`);
      if (result.list[0]) console.log(`  → first: ${JSON.stringify(result.list[0]).slice(0, 300)}`);
    } else {
      console.log(`✓ ${path}`);
      console.log(`  → result: ${JSON.stringify(result).slice(0, 250)}`);
    }
  } else {
    console.log(`✗ ${path.length > 70 ? path.slice(0, 70) + "…" : path}  code=${r.json?.code} msg="${(r.json?.msg ?? "").slice(0, 35)}"`);
  }
}

// Bonus : check si les unlock logs contiennent un field "name" ou "nick"
console.log("\n=== Check fields detailes d un unlock log ===");
const now = Date.now();
const path = `/v1.0/devices/${DEV}/logs?codes=unlock_fingerprint_kit&end_time=${now}&size=2&start_time=${now - 24*3600_000}&type=7`;
const r = await call(tok, "GET", path);
if (r.json?.success && r.json.result?.logs?.[0]) {
  console.log("Premier log raw :");
  console.log(JSON.stringify(r.json.result.logs[0], null, 2));
}
