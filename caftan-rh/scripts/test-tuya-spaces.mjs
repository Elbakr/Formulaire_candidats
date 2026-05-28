// Karim 2026-05-24 : explore l API v2.0/cloud/space pour acceder aux devices
// via le nouveau pattern Smart Home Tuya.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const BASE = "https://openapi.tuyaeu.com"; // WE seul repond
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
console.log("Token OK\n");

// 1. Top-level spaces
console.log("--- /v2.0/cloud/space/child (top-level spaces) ---");
const r1 = await call(tok, "GET", "/v2.0/cloud/space/child");
console.log("  result:", JSON.stringify(r1.json?.result, null, 2));

const spaces = r1.json?.result?.data ?? [];
for (const sp of spaces) {
  const sid = sp.space_id ?? sp.id;
  if (!sid) continue;
  console.log(`\n--- Space ${sid} (${sp.name}) : devices ---`);
  const rd = await call(tok, "GET", `/v2.0/cloud/thing/space/device?space_ids=${sid}&page_size=20`);
  console.log("  code:", rd.json?.code, "msg:", rd.json?.msg, "result:", JSON.stringify(rd.json?.result).slice(0, 200));

  const rd2 = await call(tok, "GET", `/v2.0/cloud/space/${sid}/devices?page_size=20`);
  console.log("  alt v2 code:", rd2.json?.code, "msg:", rd2.json?.msg, "result:", JSON.stringify(rd2.json?.result).slice(0, 200));

  console.log(`\n--- Space ${sid} : users ---`);
  const ru = await call(tok, "GET", `/v2.0/cloud/space/member?space_id=${sid}&page_size=20`);
  console.log("  code:", ru.json?.code, "msg:", ru.json?.msg, "result:", JSON.stringify(ru.json?.result).slice(0, 200));
}

// 2. Direct device par id (avec v2.0 thing namespace)
console.log("\n--- /v2.0/cloud/thing/{device_id} sur les 5 terminaux pointage ---");
const DEVICES = [
  "bfffc2848a716cdeeeglax",
  "bfd90b87c696ead286zzxm",
  "bf82afe3706630c4ff2mtp",
  "bf668eaa15b73d5f56nisa",
  "bf3984c8a5ba98b929cpgs",
];
for (const id of DEVICES) {
  const r = await call(tok, "GET", `/v2.0/cloud/thing/${id}`);
  const ok = r.json?.success ? "✓" : "✗";
  console.log(`  ${ok} ${id} code=${r.json?.code} msg="${(r.json?.msg ?? "").slice(0, 40)}" name=${r.json?.result?.name ?? "?"}`);
}
