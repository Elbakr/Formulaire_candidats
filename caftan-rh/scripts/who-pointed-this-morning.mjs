// Karim 2026-05-24 : scan les unlocks de CE MATIN (9h-12h) sur les 5 devices
// pour identifier qui a pointe ou. But : verifier definitivement quel device
// est Pointage A vs Pointage E.

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

// 2 dernieres heures (pour capturer les OUT de fin de journee)
const now = new Date();
const startMs = Date.now() - 2 * 3600_000;
const endMs = Date.now();
console.log(`Plage : ${new Date(startMs).toLocaleString("fr-BE")} -> ${new Date(endMs).toLocaleString("fr-BE")}\n`);

const DEVICES = [
  ["bfd90b87c696ead286zzxm", "BD currently: Pointage A"],
  ["bfffc2848a716cdeeeglax", "BD currently: Pointage E"],
  ["bf82afe3706630c4ff2mtp", "BD: ElectroZeyn"],
  ["bf668eaa15b73d5f56nisa", "BD: Pointage C et F"],
  ["bf3984c8a5ba98b929cpgs", "BD: Acces Platinum"],
];

for (const [id, label] of DEVICES) {
  const path = `/v1.0/devices/${id}/logs?codes=unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit&end_time=${endMs}&size=50&start_time=${startMs}&type=7`;
  const r = await call(tok, "GET", path);
  if (!r.json?.success) {
    console.log(`✗ ${label} : code=${r.json?.code}`);
    continue;
  }
  const logs = r.json.result?.logs ?? [];
  console.log(`\n========== ${label} (${id}) : ${logs.length} unlock(s) ce matin ==========`);
  // Recupere aussi les noms enroles pour faire le cross
  const ru = await call(tok, "GET", `/v1.0/devices/${id}/users`);
  const users = ru.json?.success ? (ru.json.result ?? []) : [];
  console.log(`  ${users.length} users enrôlés sur ce device.`);

  // Pour chaque log, decode et essaye d associer un nom
  for (const log of logs.sort((a,b) => a.event_time - b.event_time)) {
    const buf = Buffer.from(log.value ?? "", "base64");
    const slot = buf.length >= 4 ? buf.readUInt32BE(0) : "?";
    const time = new Date(log.event_time).toLocaleTimeString("fr-BE");
    console.log(`    ${time} | code=${log.code} | tuya_user_id_in_device=${slot} | hex=${buf.toString("hex")}`);
  }
}
