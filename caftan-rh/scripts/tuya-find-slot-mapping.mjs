// Karim 2026-05-24 : essaye plusieurs endpoints pour obtenir le mapping
// user_id alphanumerique <-> slot local du terminal pour Pointage A.

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

const DEV = "bfb90ad2054971aefatjkh";
const TEST_USER = "4hnqyu"; // Omaima (premier user)

const ENDPOINTS = [
  // Detail user d'un device
  `/v1.0/devices/${DEV}/users/${TEST_USER}`,
  `/v2.0/cloud/thing/${DEV}/users/${TEST_USER}`,
  `/v1.0/iot-03/devices/${DEV}/users/${TEST_USER}`,
  // Door lock / lock user endpoints
  `/v1.0/devices/${DEV}/door-lock/users/${TEST_USER}`,
  `/v1.0/devices/${DEV}/lock-users`,
  `/v1.0/devices/${DEV}/lock-users/${TEST_USER}`,
  // Fingerprints / cards
  `/v1.0/devices/${DEV}/fingerprints`,
  `/v1.0/devices/${DEV}/users/${TEST_USER}/fingerprints`,
  // Access control system
  `/v1.0/access-control/devices/${DEV}/users`,
  `/v1.0/devices/${DEV}/properties`,
  // Shadow / DPS qui peut inclure user list
  `/v2.0/cloud/thing/${DEV}/shadow/properties`,
  // Permissions / member
  `/v1.0/devices/${DEV}/permissions`,
  `/v1.0/devices/${DEV}/user-list`,
];

for (const path of ENDPOINTS) {
  const r = await call(tok, "GET", path);
  if (r.json?.success) {
    const result = r.json.result;
    let summary;
    if (Array.isArray(result)) summary = `[Array len=${result.length}]`;
    else if (typeof result === "object") summary = `keys=${Object.keys(result ?? {}).slice(0, 8).join(",")}`;
    else summary = String(result);
    console.log(`✓ ${path}`);
    console.log(`   → ${summary}`);
    if (typeof result === "object") {
      const text = JSON.stringify(result).slice(0, 350);
      console.log(`   → ${text}`);
    }
  } else {
    console.log(`✗ ${path.slice(0, 70)}  code=${r.json?.code} msg="${(r.json?.msg ?? "").slice(0, 35)}"`);
  }
}
