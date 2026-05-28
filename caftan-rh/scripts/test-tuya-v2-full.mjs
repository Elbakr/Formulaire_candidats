// Karim 2026-05-24 : explore l API v2.0 complete - space devices, users de
// chaque terminal, access logs. Sur WE qui repond.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const BASE = "https://openapi.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";
const SPACE_ID = "206482687";

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
console.log("Token OK on WE\n");

// 1. Devices du space (multi formats)
const ATTEMPTS = [
  `/v2.0/cloud/thing/space/device?space_ids=${SPACE_ID}&page_size=20`,
  `/v2.0/cloud/thing/space/device?space_id=${SPACE_ID}&page_size=20`,
  `/v2.0/cloud/space/${SPACE_ID}/device?page_size=20`,
  `/v2.0/cloud/space/device?space_id=${SPACE_ID}&page_size=20`,
  `/v2.0/cloud/thing/device?space_id=${SPACE_ID}&page_size=20`,
];
console.log("=== Listing devices du space ===");
for (const p of ATTEMPTS) {
  const r = await call(tok, "GET", p);
  const ok = r.json?.success ? "✓" : "✗";
  console.log(`  ${ok} ${p}`);
  console.log(`     code=${r.json?.code} msg="${(r.json?.msg ?? "").slice(0, 50)}"`);
  if (r.json?.success && r.json?.result) {
    const txt = JSON.stringify(r.json.result).slice(0, 400);
    console.log(`     result=${txt}`);
  }
}

// 2. Detail v2.0 + users d un device
console.log("\n=== Detail + users pour bfd90b87c696ead286zzxm (pointage E) ===");
const DEV = "bfd90b87c696ead286zzxm";
const DEV_ENDPOINTS = [
  `/v2.0/cloud/thing/${DEV}`,
  `/v2.0/cloud/thing/${DEV}/users`,
  `/v2.0/cloud/thing/${DEV}/member`,
  `/v1.0/cloud/thing/${DEV}/user`,
  `/v2.0/cloud/thing/${DEV}/specification`,
  `/v2.0/cloud/thing/${DEV}/shadow/properties`,
];
for (const p of DEV_ENDPOINTS) {
  const r = await call(tok, "GET", p);
  const ok = r.json?.success ? "✓" : "✗";
  const code = r.json?.code;
  const msg = (r.json?.msg ?? "").slice(0, 40);
  if (r.json?.success) {
    const result = r.json.result;
    if (Array.isArray(result)) console.log(`  ${ok} ${p}\n     → array len=${result.length} first=${JSON.stringify(result[0] ?? null).slice(0, 200)}`);
    else if (result?.list) console.log(`  ${ok} ${p}\n     → list len=${result.list.length} first=${JSON.stringify(result.list[0] ?? null).slice(0, 200)}`);
    else console.log(`  ${ok} ${p}\n     → keys=${Object.keys(result ?? {}).slice(0, 6).join(",")} ${JSON.stringify(result).slice(0, 200)}`);
  } else {
    console.log(`  ${ok} ${p} code=${code} msg="${msg}"`);
  }
}

// 3. Access logs - format historique
console.log("\n=== Access logs ===");
const since = Date.now() - 30 * 86400_000;
const LOG_ENDPOINTS = [
  `/v1.0/iot-02/access-control-logs?page_size=20&start_time=${since}&end_time=${Date.now()}`,
  `/v2.0/cloud/thing/${DEV}/access-control/logs?page_size=20&start_time=${since}&end_time=${Date.now()}`,
  `/v2.0/cloud/access-control/logs?device_id=${DEV}&page_size=20&start_time=${since}&end_time=${Date.now()}`,
  `/v2.0/cloud/thing/${DEV}/report-logs?codes=lock_record&start_time=${since}&end_time=${Date.now()}&size=20`,
];
for (const p of LOG_ENDPOINTS) {
  const r = await call(tok, "GET", p);
  const ok = r.json?.success ? "✓" : "✗";
  console.log(`  ${ok} ${p.slice(0, 80)}...`);
  console.log(`     code=${r.json?.code} msg="${(r.json?.msg ?? "").slice(0, 40)}"`);
  if (r.json?.success) {
    console.log(`     result=${JSON.stringify(r.json.result).slice(0, 250)}`);
  }
}
