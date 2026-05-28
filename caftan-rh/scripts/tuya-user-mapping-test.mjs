// Karim 2026-05-24 : trouve la correspondance entre tuya_user_id (chaine ex
// "4v7cfu" retournee par /users) et user_id_in_device (uint32 25 dans le
// value base64 des unlock logs).

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

const DEV = "bf668eaa15b73d5f56nisa"; // Pointage C et F

// 1. Liste des 27 users avec ALL fields
console.log("=== Users (27 attendus) ===");
const r = await call(tok, "GET", `/v1.0/devices/${DEV}/users`);
const users = r.json.result ?? [];
console.log(`Total : ${users.length} users\n`);
console.log("All fields du premier user :");
console.log(JSON.stringify(users[0], null, 2));

console.log("\nTous les users (index | user_id | nick_name) :");
for (let i = 0; i < users.length; i++) {
  const u = users[i];
  console.log(`  ${String(i).padStart(2)} | ${u.user_id} | "${u.nick_name}"`);
}

// 2. Detail d un user specifique
console.log("\n=== Detail user '4v7cfu' (premier) ===");
const rd = await call(tok, "GET", `/v1.0/devices/${DEV}/users/${users[0]?.user_id}`);
if (rd.json?.success) {
  console.log(JSON.stringify(rd.json.result, null, 2));
} else {
  console.log("Echec:", rd.json?.code, rd.json?.msg);
}

// 3. Cherche endpoint pour fingerprints / cards du user
console.log("\n=== Endpoints additionnels ===");
const endpoints = [
  `/v1.0/devices/${DEV}/door-lock/users`,
  `/v1.0/devices/${DEV}/fingerprints`,
  `/v1.0/devices/${DEV}/door-lock/fingerprints`,
  `/v1.0/devices/${DEV}/users/${users[0]?.user_id}/fingerprints`,
  `/v1.0/devices/${DEV}/users/${users[0]?.user_id}/passwords`,
  `/v1.0/devices/${DEV}/users/${users[0]?.user_id}/cards`,
];
for (const p of endpoints) {
  const rp = await call(tok, "GET", p);
  if (rp.json?.success) {
    const result = rp.json.result;
    console.log(`✓ ${p}`);
    console.log(`  → ${typeof result === "object" ? JSON.stringify(result).slice(0, 300) : result}`);
  } else {
    console.log(`✗ ${p}  code=${rp.json?.code} msg="${(rp.json?.msg ?? "").slice(0, 30)}"`);
  }
}
