// Karim 2026-05-24 : test acces individuel a un device + recuperation logs
// d acces. Confirme que les terminaux pointage sont accessibles via l API.

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
  return { sign: hmac(SECRET, CID + token + t + nonce + `${method}\n${sha256(body)}\n\n${urlPath}`), t, nonce };
}
async function call(token, method, urlPath, body = "") {
  const { sign: s, t, nonce } = sign(token, method, urlPath, body);
  const headers = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce };
  if (token) headers.access_token = token;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + urlPath, { method, headers, body: body || undefined });
  const txt = await res.text();
  try { return { status: res.status, json: JSON.parse(txt) }; } catch { return { status: res.status, txt }; }
}

const tokenRes = await call("", "GET", "/v1.0/token?grant_type=1");
if (!tokenRes.json?.success) {
  console.log("ECHEC token:", JSON.stringify(tokenRes.json));
  process.exit(1);
}
const tok = tokenRes.json.result.access_token;
console.log("Token OK\n");

const POINTAGE_DEVICES = [
  { id: "bfffc2848a716cdeeeglax", name: "Accès E" },
  { id: "bfd90b87c696ead286zzxm", name: "pointage E" },
  { id: "bf82afe3706630c4ff2mtp", name: "Pointage ElectroZeyn" },
  { id: "bf668eaa15b73d5f56nisa", name: "Pointage C et F" },
  { id: "bf3984c8a5ba98b929cpgs", name: "Accès Platinum" },
];

for (const dev of POINTAGE_DEVICES) {
  console.log(`\n=== ${dev.name} (${dev.id}) ===`);
  // 1. Detail du device
  const r1 = await call(tok, "GET", `/v1.0/devices/${dev.id}`);
  if (r1.json?.success) {
    const d = r1.json.result;
    console.log(`  detail OK : product=${d.product_name} | category=${d.category} | online=${d.online}`);
  } else {
    console.log(`  detail ECHEC code=${r1.json?.code} msg=${r1.json?.msg}`);
  }
  // 2. Users du device (pour le mapping fingerprint -> employee)
  const r2 = await call(tok, "GET", `/v1.0/devices/${dev.id}/users`);
  if (r2.json?.success) {
    const list = r2.json.result ?? [];
    console.log(`  users : ${list.length} enregistres`);
    for (const u of list.slice(0, 8)) {
      console.log(`    user_id=${u.user_id ?? u.id} | name="${u.user_name ?? u.name}" | type=${u.user_type ?? "?"}`);
    }
  } else {
    console.log(`  users ECHEC code=${r2.json?.code} msg=${r2.json?.msg}`);
  }
}
