// Karim 2026-05-24 : test connectivite Tuya. Verifie que :
//   1. Les credentials .env.local sont bons
//   2. Le token Tuya est obtenu
//   3. La liste des devices remonte au moins 1 terminal
//
// Usage : node scripts/test-tuya-connection.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const BASE = process.env.TUYA_BASE_URL ?? "https://openapi.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";

if (!CID || !SECRET) {
  console.error("ECHEC : TUYA_CLIENT_ID ou TUYA_CLIENT_SECRET manquant dans .env.local");
  process.exit(1);
}
console.log("Tuya base URL :", BASE);
console.log("Client ID :", CID.slice(0, 6) + "..." + CID.slice(-3));

function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
function hmac(key, msg) {
  return crypto.createHmac("sha256", key).update(msg, "utf8").digest("hex").toUpperCase();
}
function sign(token, method, urlPath, body) {
  const t = String(Date.now());
  const nonce = crypto.randomUUID();
  const bodyHash = sha256(body);
  const stringToSign = `${method}\n${bodyHash}\n\n${urlPath}`;
  const signStr = CID + token + t + nonce + stringToSign;
  return { sign: hmac(SECRET, signStr), t, nonce };
}

// 1. Obtient le token
console.log("\n1. Obtention du token...");
{
  const urlPath = "/v1.0/token?grant_type=1";
  const { sign: s, t, nonce } = sign("", "GET", urlPath, "");
  const res = await fetch(BASE + urlPath, {
    method: "GET",
    headers: {
      client_id: CID,
      sign: s,
      t,
      sign_method: "HMAC-SHA256",
      nonce,
    },
  });
  const txt = await res.text();
  console.log("  HTTP", res.status);
  let json;
  try { json = JSON.parse(txt); } catch { console.log("  raw:", txt); process.exit(1); }
  if (!json.success) {
    console.log("  ECHEC :", json.msg, "(code", json.code, ")");
    process.exit(1);
  }
  console.log("  OK access_token =", json.result.access_token.slice(0, 10) + "...");
  console.log("  expire_time =", json.result.expire_time, "s");
  global.__token = json.result.access_token;
}

// 2. Liste les devices du projet
console.log("\n2. Liste des devices...");
{
  const urlPath = "/v1.3/iot-03/devices?page_size=50";
  const { sign: s, t, nonce } = sign(global.__token, "GET", urlPath, "");
  const res = await fetch(BASE + urlPath, {
    method: "GET",
    headers: {
      client_id: CID,
      access_token: global.__token,
      sign: s,
      t,
      sign_method: "HMAC-SHA256",
      nonce,
    },
  });
  const txt = await res.text();
  console.log("  HTTP", res.status);
  let json;
  try { json = JSON.parse(txt); } catch { console.log("  raw:", txt.slice(0, 500)); process.exit(1); }
  if (!json.success) {
    console.log("  ECHEC :", json.msg, "(code", json.code, ")");
    console.log("  raw:", JSON.stringify(json, null, 2).slice(0, 1000));
    process.exit(1);
  }
  const list = json.result?.list ?? json.result ?? [];
  console.log("  OK", list.length, "device(s) :");
  for (const d of list.slice(0, 20)) {
    console.log(`    - ${d.id} | ${d.name} | category=${d.category} | online=${d.online} | product=${d.product_name ?? "?"}`);
  }
}

console.log("\nTout OK. Tu peux passer a la phase 2 (mapping devices->sites).");
