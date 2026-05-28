// Karim 2026-05-24 : scan profond pour trouver TOUS les devices linkés au
// projet dev Tuya via les 10 comptes mobiles. Tente pagination + variants.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const BASE = process.env.TUYA_BASE_URL ?? "https://openapi.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";
const SPACE = process.env.TUYA_SPACE_ID ?? "206482687";

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

// === Tentative 1 : paginate sur /v2.0/cloud/thing/device avec last_id ===
console.log("=== Pagination /v2.0/cloud/thing/device ===");
let lastId = "";
let allDevices = new Map();
for (let i = 0; i < 10; i++) {
  const path = lastId
    ? `/v2.0/cloud/thing/device?last_id=${lastId}&page_size=20`
    : `/v2.0/cloud/thing/device?page_size=20`;
  const r = await call(tok, "GET", path);
  if (!r.json?.success) { console.log(`  Page ${i+1}: echec code=${r.json?.code}`); break; }
  const items = r.json.result ?? [];
  if (items.length === 0) break;
  for (const d of items) allDevices.set(d.id, d);
  console.log(`  Page ${i+1}: ${items.length} devices, total cumule=${allDevices.size}`);
  if (items.length < 20) break;
  lastId = items[items.length - 1].id;
}

console.log(`\nTotal devices uniques via pagination : ${allDevices.size}\n`);
for (const d of allDevices.values()) {
  console.log(`  ${d.id} | "${d.customName ?? d.name}" | cat=${d.category} | space=${d.bindSpaceId} | active=${new Date((d.activeTime ?? 0) * 1000).toLocaleDateString("fr-BE")}`);
}

// === Tentative 2 : recuperer les sub-spaces (peut-etre Pointage A est dans un sub-space) ===
console.log("\n=== Sub-spaces du projet ===");
const r2 = await call(tok, "GET", "/v2.0/cloud/space/child");
console.log(`  result: ${JSON.stringify(r2.json?.result)}`);
const spaceIds = r2.json?.result?.data ?? [];

// === Tentative 3 : iter sur chaque space ===
for (const sid of spaceIds) {
  const r3 = await call(tok, "GET", `/v2.0/cloud/thing/device?page_size=20&space_ids=${sid}`);
  const items = r3.json?.result ?? [];
  console.log(`  Space ${sid} : ${Array.isArray(items) ? items.length : "?"} devices`);
}

// === Tentative 4 : peut-etre via endpoint apps/users (pour 10 comptes) ===
console.log("\n=== Liste mobile users linkes ===");
const r4 = await call(tok, "GET", "/v1.0/iot-01/associated-users/users?page_size=20");
console.log(`  iot-01 : code=${r4.json?.code} msg="${r4.json?.msg}"`);

const r5 = await call(tok, "GET", "/v1.0/iot-01/associated-users/users?page_no=1&page_size=20");
console.log(`  iot-01 page_no : code=${r5.json?.code} msg="${r5.json?.msg}"`);

// === Tentative 5 : recently bound devices ===
console.log("\n=== Tentative endpoints divers ===");
const ENDPOINTS = [
  "/v2.0/cloud/thing/device/recent",
  "/v2.0/cloud/thing/device/total",
  "/v2.0/cloud/thing/device/factory-info",
  `/v1.0/iot-01/associated-users/devices?page_size=20&schema=`,
  "/v1.0/cloud/devices",
  "/v1.0/iot-03/devices?page_size=20",
];
for (const p of ENDPOINTS) {
  const r = await call(tok, "GET", p);
  if (r.json?.success) {
    const result = r.json.result;
    const isList = Array.isArray(result) || result?.list;
    const len = Array.isArray(result) ? result.length : (result?.list?.length ?? "?");
    console.log(`  ✓ ${p} → ${isList ? `${len} items` : JSON.stringify(result).slice(0, 100)}`);
  } else {
    console.log(`  ✗ ${p.slice(0, 60)} → code=${r.json?.code} msg="${(r.json?.msg ?? "").slice(0, 30)}"`);
  }
}
