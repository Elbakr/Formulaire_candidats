// Karim 2026-05-24 : utilise /v1.0/iot-01/associated-users/devices pour
// recuperer TOUS les devices linkes via les comptes mobiles (les "10 comptes").

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

// Pagination via has_more / last_row_key
let allDevices = new Map();
let lastRowKey = "";
for (let i = 0; i < 20; i++) {
  const path = lastRowKey
    ? `/v1.0/iot-01/associated-users/devices?last_row_key=${lastRowKey}&page_size=20&schema=`
    : `/v1.0/iot-01/associated-users/devices?page_size=20&schema=`;
  const r = await call(tok, "GET", path);
  if (!r.json?.success) {
    console.log(`Page ${i+1}: ECHEC code=${r.json?.code} msg=${r.json?.msg}`);
    break;
  }
  const result = r.json.result ?? {};
  const devices = result.devices ?? [];
  const hasMore = result.has_more;
  const nextKey = result.last_row_key ?? "";
  console.log(`Page ${i+1}: ${devices.length} devices, has_more=${hasMore}`);
  for (const d of devices) {
    allDevices.set(d.id, d);
  }
  if (!hasMore || devices.length === 0 || !nextKey || nextKey === lastRowKey) break;
  lastRowKey = nextKey;
}

console.log(`\n=== Total devices linkes via comptes mobiles : ${allDevices.size} ===\n`);
for (const d of allDevices.values()) {
  const cat = d.category;
  const isPointage = cat === "mk";
  const flag = isPointage ? "📍" : "🔒";
  console.log(`${flag} ${d.id} | "${d.name ?? d.custom_name ?? "?"}" | cat=${cat} | online=${d.online}`);
}

console.log("\n=== Devices NON DEJA EN BDD (candidats Pointage A) ===");
const KNOWN_IN_DB = new Set([
  "bfffc2848a716cdeeeglax",
  "bf7a05702d14cf4b6aulkq",
  "bfd6a211e7b75f69e5vlzs",
  "bf971f85d8394f8222otkj",
  "bfd90b87c696ead286zzxm",
  "bf82afe3706630c4ff2mtp",
  "bf668eaa15b73d5f56nisa",
  "bf3984c8a5ba98b929cpgs",
  "60422568bcff4d095350",
]);
for (const d of allDevices.values()) {
  if (!KNOWN_IN_DB.has(d.id)) {
    console.log(`  🆕 ${d.id} | "${d.name ?? d.custom_name ?? "?"}" | cat=${d.category} | online=${d.online}`);
  }
}
