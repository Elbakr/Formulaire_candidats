// Karim 2026-05-24 : compare l API sur les 5 data centers Tuya pour identifier
// celui qui repond aux devices linkes. Le projet est cense etre sur Central
// Europe (openapi-weaz.tuyaeu.com) mais le code 28841107 persiste.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";

const DCS = [
  ["CE (Central Europe)", "https://openapi-weaz.tuyaeu.com"],
  ["WE (Western Europe)", "https://openapi.tuyaeu.com"],
  ["US East",             "https://openapi.tuyaus.com"],
  ["US West",             "https://openapi-ueaz.tuyaus.com"],
  ["China",               "https://openapi.tuyacn.com"],
  ["India",               "https://openapi.tuyain.com"],
];

function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(key, msg) { return crypto.createHmac("sha256", key).update(msg, "utf8").digest("hex").toUpperCase(); }
function sign(token, method, urlPath, body) {
  const t = String(Date.now()), nonce = crypto.randomUUID();
  return { sign: hmac(SECRET, CID + token + t + nonce + `${method}\n${sha256(body)}\n\n${urlPath}`), t, nonce };
}
async function call(base, token, method, urlPath) {
  const { sign: s, t, nonce } = sign(token, method, urlPath, "");
  const headers = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce };
  if (token) headers.access_token = token;
  try {
    const res = await fetch(base + urlPath, { method, headers });
    const txt = await res.text();
    try { return { status: res.status, json: JSON.parse(txt) }; } catch { return { status: res.status, txt }; }
  } catch (e) { return { error: e.message }; }
}

for (const [name, base] of DCS) {
  console.log(`\n=== ${name} (${base}) ===`);
  const tokenRes = await call(base, "", "GET", "/v1.0/token?grant_type=1");
  if (tokenRes.error) { console.log("  network error:", tokenRes.error); continue; }
  if (!tokenRes.json?.success) {
    console.log(`  token ECHEC code=${tokenRes.json?.code} msg="${tokenRes.json?.msg}"`);
    continue;
  }
  const tok = tokenRes.json.result.access_token;
  console.log("  token OK");
  const r = await call(base, tok, "GET", "/v1.3/iot-03/devices?page_size=10");
  if (r.json?.success) {
    const list = r.json.result?.list ?? [];
    console.log(`  /v1.3/iot-03/devices : OK, ${list.length} device(s)`);
    for (const d of list.slice(0, 5)) console.log(`    ${d.id} | ${d.name}`);
  } else {
    console.log(`  /v1.3/iot-03/devices : code=${r.json?.code} msg="${(r.json?.msg ?? "").slice(0, 50)}"`);
  }
}
