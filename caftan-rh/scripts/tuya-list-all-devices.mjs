// Karim 2026-05-24 : liste TOUS les devices visibles par le projet dev Tuya,
// via plusieurs endpoints. But : trouver le device "A" / "Pointage A" qui
// n est peut-etre pas dans la liste de 9 que Karim m a partagee.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const BASE = process.env.TUYA_BASE_URL ?? "https://openapi.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";
const SPACE = process.env.TUYA_SPACE_ID ?? "206482687";

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
console.log(`Token OK, space=${SPACE}\n`);

const ENDPOINTS = [
  `/v2.0/cloud/thing/device?page_size=20&space_ids=${SPACE}`,
  `/v2.0/cloud/thing/device?page_size=20`,
  `/v2.0/cloud/thing/space/device?page_size=20&space_ids=${SPACE}`,
  `/v2.0/cloud/thing/space/child?page_size=20`,
  `/v2.0/cloud/space/child?page_size=20`,
  `/v2.0/cloud/space/${SPACE}?page_size=20`,
];

for (const path of ENDPOINTS) {
  const r = await call(tok, "GET", path);
  if (r.json?.success) {
    const result = r.json.result;
    let items = [];
    if (Array.isArray(result)) items = result;
    else if (result?.list) items = result.list;
    else if (result?.data) items = Array.isArray(result.data) ? result.data : [];
    console.log(`✓ ${path}`);
    console.log(`  → ${items.length} item(s) ${items.length > 0 ? `keys=${Object.keys(items[0] ?? {}).slice(0,8).join(",")}` : ""}`);
    if (items.length > 0 && items.length < 20) {
      for (const d of items) {
        const id = d.id ?? d.device_id ?? d.tuya_device_id ?? d.uuid;
        const name = d.custom_name ?? d.name ?? d.tuya_device_name ?? d.device_name;
        if (id) console.log(`     ${id} | "${name ?? "?"}" | category=${d.category ?? "?"}`);
      }
    }
  } else {
    console.log(`✗ ${path.length > 75 ? path.slice(0, 75) + "…" : path}`);
    console.log(`  code=${r.json?.code} msg="${(r.json?.msg ?? "").slice(0, 50)}"`);
  }
}
