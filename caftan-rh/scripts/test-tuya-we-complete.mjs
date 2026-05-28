// Karim 2026-05-24 : test complet sur Western Europe DC (qui repond) pour voir
// si le mobile account est linke et si on peut acceder aux 9 devices listes.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const BASE = "https://openapi.tuyaeu.com"; // Western Europe
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";

function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(key, msg) { return crypto.createHmac("sha256", key).update(msg, "utf8").digest("hex").toUpperCase(); }
function sign(token, method, urlPath) {
  const t = String(Date.now()), nonce = crypto.randomUUID();
  return { sign: hmac(SECRET, CID + token + t + nonce + `${method}\n${sha256("")}\n\n${urlPath}`), t, nonce };
}
async function call(token, method, urlPath) {
  const { sign: s, t, nonce } = sign(token, method, urlPath);
  const headers = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce };
  if (token) headers.access_token = token;
  const res = await fetch(BASE + urlPath, { method, headers });
  const txt = await res.text();
  try { return { status: res.status, json: JSON.parse(txt) }; } catch { return { status: res.status, txt }; }
}

const tokenRes = await call("", "GET", "/v1.0/token?grant_type=1");
const tok = tokenRes.json?.result?.access_token;
if (!tok) { console.log("ECHEC token"); process.exit(1); }
console.log("Token OK on Western Europe\n");

// 1. Associated mobile users
console.log("--- Associated mobile users (Smart Life accounts lies au projet) ---");
{
  const r = await call(tok, "GET", "/v1.0/iot-01/associated-users/users?page_size=20");
  if (r.json?.success) {
    const list = r.json.result?.list ?? [];
    console.log(`  ${list.length} mobile account(s) lie(s) au projet`);
    for (const u of list) {
      console.log(`    uid=${u.uid} | username=${u.username} | nick=${u.nick_name} | country=${u.country_code}`);
      global.__uid = u.uid;
    }
  } else {
    console.log(`  ECHEC code=${r.json?.code} msg="${r.json?.msg}"`);
  }
}

// 2. Devices du mobile user (si uid trouve)
if (global.__uid) {
  console.log(`\n--- Devices du mobile uid=${global.__uid} ---`);
  const r = await call(tok, "GET", `/v1.0/users/${global.__uid}/devices?page_size=50`);
  if (r.json?.success) {
    const devs = r.json.result ?? [];
    console.log(`  ${devs.length} device(s) trouve(s)`);
    for (const d of devs) {
      console.log(`    ${d.id} | "${d.name}" | category=${d.category} | online=${d.online} | product=${d.product_name ?? "?"}`);
    }
  } else {
    console.log(`  ECHEC code=${r.json?.code} msg="${r.json?.msg}"`);
  }
}

// 3. Sinon, liste tous les devices du projet (asset-based)
console.log(`\n--- Devices du projet (asset-based) ---`);
{
  const r = await call(tok, "GET", "/v1.3/iot-03/devices?page_size=50");
  if (r.json?.success) {
    const list = r.json.result?.list ?? [];
    console.log(`  ${list.length} device(s)`);
    for (const d of list) {
      console.log(`    ${d.id} | "${d.name}" | category=${d.category}`);
    }
  } else {
    console.log(`  ECHEC code=${r.json?.code} msg="${r.json?.msg}"`);
  }
}
