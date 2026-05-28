// Karim 2026-05-24 : essaie l API moderne Tuya Smart Home v2 pour lister
// schemas + linked users + devices. Test sur les 2 DC (WE et CE).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";

function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(key, msg) { return crypto.createHmac("sha256", key).update(msg, "utf8").digest("hex").toUpperCase(); }
function sign(token, method, urlPath) {
  const t = String(Date.now()), nonce = crypto.randomUUID();
  return { sign: hmac(SECRET, CID + token + t + nonce + `${method}\n${sha256("")}\n\n${urlPath}`), t, nonce };
}
async function call(base, token, method, urlPath) {
  const { sign: s, t, nonce } = sign(token, method, urlPath);
  const headers = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce };
  if (token) headers.access_token = token;
  const res = await fetch(base + urlPath, { method, headers });
  const txt = await res.text();
  try { return { status: res.status, json: JSON.parse(txt) }; } catch { return { status: res.status, txt }; }
}

const DCS = [
  ["WE", "https://openapi.tuyaeu.com"],
  ["CE", "https://openapi-weaz.tuyaeu.com"],
];

const ENDPOINTS = [
  // Listing schemas (apps) qui sont autorises
  "/v1.0/apps/schemas",
  "/v1.0/iot-01/apps",
  "/v1.1/iot-01/associated-users/users?page_no=1&page_size=20",
  "/v1.0/iot-01/associated-users/users?schema=tuyaSmart&page_no=1&page_size=20",
  "/v1.0/iot-01/associated-users/users?source=tuyaUser&page_no=1&page_size=20",
  // Devices du projet via different paths
  "/v1.0/iot-03/devices?page_no=1&page_size=20",
  "/v1.0/devices?page_no=1&page_size=20",
  // Spaces / Project info
  "/v2.0/cloud/space/child",
  "/v1.0/cloud/space/list?page_no=1&page_size=20",
];

for (const [name, base] of DCS) {
  console.log(`\n========== ${name} (${base}) ==========`);
  const tokRes = await call(base, "", "GET", "/v1.0/token?grant_type=1");
  const tok = tokRes.json?.result?.access_token;
  if (!tok) { console.log(`  token ECHEC code=${tokRes.json?.code} msg="${tokRes.json?.msg}"`); continue; }
  console.log("  token OK");
  for (const p of ENDPOINTS) {
    const r = await call(base, tok, "GET", p);
    const ok = r.json?.success ? "✓" : "✗";
    const code = r.json?.code;
    const msg = (r.json?.msg ?? "").slice(0, 50);
    let res = "";
    if (r.json?.success) {
      const result = r.json.result;
      if (Array.isArray(result)) res = `[len=${result.length}]`;
      else if (result?.list) res = `{list=${result.list.length}}`;
      else if (result?.schemas) res = `{schemas=${result.schemas.length}}`;
      else res = `keys=${Object.keys(result ?? {}).slice(0, 4).join(",")}`;
      // Print first items if success and has list
      if (Array.isArray(result) && result.length) console.log(`    ${ok} ${p}\n       → ${JSON.stringify(result[0]).slice(0, 150)}`);
      else if (result?.list?.length) console.log(`    ${ok} ${p}\n       → first: ${JSON.stringify(result.list[0]).slice(0, 150)}`);
      else if (result?.schemas?.length) console.log(`    ${ok} ${p}\n       → schemas: ${result.schemas.map(s => s.schema ?? s.code).join(",")}`);
      else console.log(`    ${ok} ${p} result=${res}`);
    } else {
      console.log(`    ${ok} ${p} code=${code} msg="${msg}"`);
    }
  }
}
