// Karim 2026-05-24 : essaie plusieurs endpoints Tuya pour trouver celui qui
// retourne les devices liés via le compte mobile (Smart Life App).
// L API /v1.3/iot-03/devices ne marche que pour devices source_type=asset.
// Les devices liés via app mobile sont source_type=tuyaUser.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const BASE = process.env.TUYA_BASE_URL ?? "https://openapi-weaz.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";

function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(key, msg) { return crypto.createHmac("sha256", key).update(msg, "utf8").digest("hex").toUpperCase(); }
function sign(token, method, urlPath, body) {
  const t = String(Date.now()), nonce = crypto.randomUUID();
  const stringToSign = `${method}\n${sha256(body)}\n\n${urlPath}`;
  return { sign: hmac(SECRET, CID + token + t + nonce + stringToSign), t, nonce };
}
async function call(token, method, urlPath, body = "") {
  const { sign: s, t, nonce } = sign(token, method, urlPath, body);
  const headers = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce };
  if (token) headers.access_token = token;
  if (body) { headers["Content-Type"] = "application/json"; }
  const res = await fetch(BASE + urlPath, { method, headers, body: body || undefined });
  const txt = await res.text();
  try { return { status: res.status, json: JSON.parse(txt) }; } catch { return { status: res.status, txt }; }
}

// 1. Token
const tokenRes = await call("", "GET", "/v1.0/token?grant_type=1");
if (!tokenRes.json?.success) {
  console.log("ECHEC token:", JSON.stringify(tokenRes.json, null, 2));
  process.exit(1);
}
const tok = tokenRes.json.result.access_token;
console.log("Token OK\n");

// 2. Liste des Tuya App users lies au projet
console.log("Tentative 1 : /v1.0/iot-01/associated-users/users");
{
  const r = await call(tok, "GET", "/v1.0/iot-01/associated-users/users?page_size=20");
  console.log("  status", r.status, "success:", r.json?.success, "code:", r.json?.code, "msg:", r.json?.msg);
  if (r.json?.success && r.json?.result?.list) {
    console.log("  → utilisateurs liés :", r.json.result.list.length);
    for (const u of r.json.result.list.slice(0, 5)) {
      console.log(`    uid=${u.uid} | username=${u.username} | nick=${u.nick_name ?? "?"} | country=${u.country_code ?? "?"}`);
    }
    global.__firstUid = r.json.result.list[0]?.uid;
  }
}

// 3. Si on a un uid, lister ses devices
if (global.__firstUid) {
  console.log("\nTentative 2 : devices du user uid =", global.__firstUid);
  const r = await call(tok, "GET", `/v1.0/users/${global.__firstUid}/devices?page_size=20`);
  console.log("  status", r.status, "success:", r.json?.success);
  if (r.json?.success) {
    const devs = r.json.result ?? [];
    console.log("  → devices :", devs.length);
    for (const d of devs) {
      console.log(`    ${d.id} | ${d.name} | category=${d.category} | online=${d.online} | product=${d.product_name ?? "?"}`);
    }
  } else {
    console.log("  msg:", r.json?.msg, "code:", r.json?.code);
  }
}

// 4. Alternative : /v2.0/cloud/thing/device avec source_type=tuyaUser
console.log("\nTentative 3 : /v2.0/cloud/thing/device avec source_type=tuyaUser");
if (global.__firstUid) {
  const r = await call(tok, "GET", `/v2.0/cloud/thing/device?source_type=tuyaUser&source_id=${global.__firstUid}&page_size=20`);
  console.log("  status", r.status, "success:", r.json?.success);
  if (r.json?.success) {
    const devs = r.json.result ?? [];
    console.log("  → devices :", Array.isArray(devs) ? devs.length : "(non liste)");
    if (Array.isArray(devs)) {
      for (const d of devs) {
        console.log(`    ${d.id ?? d.device_id} | ${d.name ?? d.device_name} | category=${d.category} | online=${d.online}`);
      }
    } else {
      console.log("  result:", JSON.stringify(devs).slice(0, 300));
    }
  } else {
    console.log("  msg:", r.json?.msg, "code:", r.json?.code);
  }
}
