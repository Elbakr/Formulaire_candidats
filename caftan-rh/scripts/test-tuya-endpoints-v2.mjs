// Karim 2026-05-24 : essaie 8 endpoints Tuya differents pour acceder aux
// devices lies via l app mobile (source_type=tuyaUser).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

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
const tok = tokenRes.json?.result?.access_token;
if (!tok) { console.log("ECHEC token"); process.exit(1); }
console.log("Token OK\n");

const ENDPOINTS = [
  // Variantes pour lister users mobiles linkes
  ["GET", "/v1.0/iot-01/associated-users/users?page_size=20"],
  ["GET", "/v2.0/cloud/space/member/users?page_size=20"],
  ["GET", "/v1.0/cloud/space/users?page_size=20"],
  ["GET", "/v2.0/apps/users?page_size=20"],
  ["GET", "/v1.0/apps/schema-users?page_size=20"],
  // Endpoint direct pour devices "user linked"
  ["GET", "/v1.3/iot-03/devices?page_size=50&source_type=tuyaUser"],
  ["GET", "/v2.0/cloud/thing/device?page_size=20"],
  // Test sur un device specifique avec un autre namespace
  ["GET", "/v2.0/cloud/thing/bfd90b87c696ead286zzxm"],
  ["GET", "/v1.0/iot-03/devices/bfd90b87c696ead286zzxm"],
  ["GET", "/v1.1/iot-03/devices/bfd90b87c696ead286zzxm/specifications"],
  ["GET", "/v1.0/devices/bfd90b87c696ead286zzxm/specifications"],
  // App schemas (sometimes needed to find uid)
  ["GET", "/v1.0/iot-01/associated-users/actions/clear"],
];

for (const [method, path] of ENDPOINTS) {
  const r = await call(tok, method, path);
  const success = r.json?.success;
  const code = r.json?.code;
  const msg = (r.json?.msg ?? "").slice(0, 60);
  const resultSummary = r.json?.result
    ? Array.isArray(r.json.result)
      ? `[Array len=${r.json.result.length}]`
      : Array.isArray(r.json.result?.list)
        ? `{list len=${r.json.result.list.length}}`
        : typeof r.json.result === "object"
          ? `{keys=${Object.keys(r.json.result).slice(0, 5).join(",")}}`
          : String(r.json.result)
    : "-";
  const flag = success ? "✓" : "✗";
  console.log(`${flag} ${method} ${path.length > 65 ? path.slice(0, 65) + "..." : path}`);
  console.log(`   code=${code} msg="${msg}" result=${resultSummary}`);
}
