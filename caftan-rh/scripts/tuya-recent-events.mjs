// Karim 2026-05-24 : scan des unlock events des 60 dernieres minutes sur les
// 9 devices pour identifier sur lequel le test du collegue a atterri.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const BASE = process.env.TUYA_BASE_URL ?? "https://openapi.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";

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
console.log("Token OK\n");

const DEVICES = [
  ["Accès E (mk)            -> Pointage A?", "bfffc2848a716cdeeeglax"],
  ["pointage E (mk)         -> Site E",       "bfd90b87c696ead286zzxm"],
  ["Pointage ElectroZeyn (mk) - inactif",     "bf82afe3706630c4ff2mtp"],
  ["Pointage C et F (mk)    -> Anvers",       "bf668eaa15b73d5f56nisa"],
  ["Accès Platinum (mk)     - hors-scope",    "bf3984c8a5ba98b929cpgs"],
  ["Accès Bureau A (ms) SmartLock",           "60422568bcff4d095350"],
  ["Platinum Depot (ms) SmartLock",           "bf7a05702d14cf4b6aulkq"],
  ["Accès stock E (ms) SmartLock",            "bfd6a211e7b75f69e5vlzs"],
  ["Accès escalier E (ms) SmartLock",         "bf971f85d8394f8222otkj"],
];

const now = Date.now();
const since = now - 4 * 3600_000; // 4 heures en arriere
console.log(`Scan unlock events depuis ${new Date(since).toLocaleTimeString("fr-BE")} (4h)\n`);

let totalEvents = 0;
for (const [label, id] of DEVICES) {
  const path = `/v1.0/devices/${id}/logs?codes=unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit&end_time=${now}&size=20&start_time=${since}&type=7`;
  const r = await call(tok, "GET", path);
  if (!r.json?.success) {
    console.log(`✗ ${label.padEnd(45)} | erreur code=${r.json?.code} msg="${r.json?.msg?.slice(0,40)}"`);
    continue;
  }
  const logs = r.json.result?.logs ?? r.json.result?.list ?? [];
  totalEvents += logs.length;
  if (logs.length === 0) {
    console.log(`  ${label.padEnd(45)} | 0 event`);
    continue;
  }
  console.log(`✓ ${label.padEnd(45)} | ${logs.length} EVENT(S):`);
  for (const log of logs) {
    const buf = Buffer.from(log.value ?? "", "base64");
    const hex = buf.toString("hex");
    const method = buf[1];
    const userIdLocal = buf.length >= 12 ? buf.readUInt32BE(8) : "?";
    const methodLabels = { 1: "fingerprint", 2: "password", 3: "card", 4: "face", 5: "temp_pwd", 6: "remote", 9: "app", 255: "admin" };
    const methLabel = methodLabels[method] ?? `m${method}`;
    const time = new Date(log.event_time).toLocaleTimeString("fr-BE");
    console.log(`    ${time} | method=${methLabel} | tuya_user_id=${userIdLocal} | hex=${hex} | event_id=${log.event_id ?? "?"} status=${log.status ?? "?"}`);
  }
}

console.log(`\nTotal events sur 90 min : ${totalEvents}`);
