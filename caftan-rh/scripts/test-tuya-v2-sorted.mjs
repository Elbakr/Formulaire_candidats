// Karim 2026-05-24 : retest API v2.0 avec query params TRIES alphabetiquement
// (requis par la signature Tuya v3).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const BASE = "https://openapi.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";

function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(key, msg) { return crypto.createHmac("sha256", key).update(msg, "utf8").digest("hex").toUpperCase(); }

// Tri alphabetique des query params
function sortQuery(urlPath) {
  const [path, qs] = urlPath.split("?");
  if (!qs) return urlPath;
  const params = qs.split("&").filter(Boolean);
  params.sort((a, b) => a.split("=")[0].localeCompare(b.split("=")[0]));
  return path + "?" + params.join("&");
}

function sign(token, method, urlPath) {
  const sortedPath = sortQuery(urlPath);
  const t = String(Date.now()), nonce = crypto.randomUUID();
  return {
    sign: hmac(SECRET, CID + token + t + nonce + `${method}\n${sha256("")}\n\n${sortedPath}`),
    t, nonce, sortedPath
  };
}
async function call(token, method, urlPath) {
  const { sign: s, t, nonce, sortedPath } = sign(token, method, urlPath);
  const headers = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce };
  if (token) headers.access_token = token;
  const res = await fetch(BASE + sortedPath, { method, headers });
  const txt = await res.text();
  try { return { status: res.status, json: JSON.parse(txt) }; } catch { return { status: res.status, txt }; }
}

const tokenRes = await call("", "GET", "/v1.0/token?grant_type=1");
const tok = tokenRes.json?.result?.access_token;
console.log("Token OK\n");

// 1. Devices du space avec params tries
console.log("=== Devices du space (sorted) ===");
const r = await call(tok, "GET", "/v2.0/cloud/thing/space/device?space_ids=206482687&page_size=50");
console.log("  code:", r.json?.code, "msg:", r.json?.msg);
if (r.json?.success) {
  const devs = r.json.result ?? [];
  console.log(`  → ${devs.length} device(s) :`);
  for (const d of devs) {
    console.log(`    ${d.id} | "${d.custom_name ?? d.name}" | cat=${d.category} | online=${d.is_online}`);
  }
}

// 2. Recent unlock logs pour les 5 pointage devices
console.log("\n=== Report logs (historique unlock) - 30 derniers jours ===");
const since = Date.now() - 30 * 86400_000;
const end = Date.now();
const DEVS = [
  ["Accès E",              "bfffc2848a716cdeeeglax"],
  ["pointage E",           "bfd90b87c696ead286zzxm"],
  ["Pointage ElectroZeyn", "bf82afe3706630c4ff2mtp"],
  ["Pointage C et F",      "bf668eaa15b73d5f56nisa"],
  ["Accès Platinum",       "bf3984c8a5ba98b929cpgs"],
];
for (const [name, id] of DEVS) {
  // Essai endpoint v1.0 device logs (smart lock log API)
  const r1 = await call(tok, "GET", `/v1.0/devices/${id}/logs?codes=unlock_method_create&end_time=${end}&size=10&start_time=${since}&type=7`);
  console.log(`\n  ${name} (${id})`);
  console.log(`    /v1.0/devices/{id}/logs : code=${r1.json?.code} msg="${(r1.json?.msg ?? "").slice(0, 40)}"`);
  if (r1.json?.success) {
    const logs = r1.json.result?.logs ?? r1.json.result?.list ?? [];
    console.log(`      → ${logs.length} log(s)`);
    for (const l of logs.slice(0, 3)) console.log(`        ${JSON.stringify(l).slice(0, 200)}`);
  }

  // Essai endpoint v2.0
  const r2 = await call(tok, "GET", `/v2.0/cloud/thing/${id}/report-logs?codes=unlock_method_create&end_time=${end}&size=10&start_time=${since}`);
  console.log(`    /v2.0/cloud/thing/{id}/report-logs : code=${r2.json?.code} msg="${(r2.json?.msg ?? "").slice(0, 40)}"`);
  if (r2.json?.success) {
    const logs = r2.json.result?.logs ?? r2.json.result?.list ?? [];
    console.log(`      → ${logs.length} log(s)`);
    for (const l of logs.slice(0, 3)) console.log(`        ${JSON.stringify(l).slice(0, 250)}`);
  }
}

// 3. Users associes (mobile + dev)
console.log("\n=== Users associes au projet ===");
const ru = await call(tok, "GET", "/v1.0/iot-01/associated-users/users?page_no=1&page_size=20");
console.log("  code:", ru.json?.code, "msg:", ru.json?.msg);
if (ru.json?.success) {
  const list = ru.json.result?.list ?? [];
  console.log(`  → ${list.length} mobile account(s)`);
  for (const u of list) console.log(`    uid=${u.uid} | username=${u.username} | country=${u.country_code}`);
}
