// Karim 2026-05-24 : overview complet du VRAI Pointage A (bfb90ad2054971aefatjkh)
// users enroles + slots actifs sur 30j.

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

const DEV = "bfb90ad2054971aefatjkh";

// 1. Users enroles
console.log("=== USERS ENROLES SUR POINTAGE A ===");
const ru = await call(tok, "GET", `/v1.0/devices/${DEV}/users`);
const users = ru.json?.success ? (ru.json.result ?? []) : [];
console.log(`Total : ${users.length} users`);
for (const u of users) console.log(`  ${u.user_id} | "${u.nick_name}"`);

// 2. Activite 30j
console.log("\n=== ACTIVITE 30 JOURS ===");
const now = Date.now();
const since = now - 30 * 86400_000;
let allLogs = [];
let lastEventTime = now;
for (let p = 0; p < 20; p++) {
  const path = `/v1.0/devices/${DEV}/logs?codes=unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit&end_time=${lastEventTime}&size=50&start_time=${since}&type=7`;
  const r = await call(tok, "GET", path);
  if (!r.json?.success) { console.log(`Page ${p+1}: code=${r.json?.code} msg="${r.json?.msg}"`); break; }
  const logs = r.json.result?.logs ?? [];
  if (logs.length === 0) break;
  allLogs.push(...logs);
  if (logs.length < 50) break;
  const minTs = Math.min(...logs.map((l) => l.event_time));
  if (minTs >= lastEventTime - 1) break;
  lastEventTime = minTs - 1;
}
console.log(`Total events 30j : ${allLogs.length}`);

const bySlot = new Map();
for (const log of allLogs) {
  const buf = Buffer.from(log.value ?? "", "base64");
  if (buf.length < 4) continue;
  const slot = buf.readUInt32BE(0);
  const cur = bySlot.get(slot) ?? { count: 0, lastTs: 0, hours: [] };
  cur.count++;
  if (log.event_time > cur.lastTs) cur.lastTs = log.event_time;
  cur.hours.push(new Date(log.event_time).getHours());
  bySlot.set(slot, cur);
}

console.log("\nSlot | Pointages 30j | Dernier event           | Plage horaire");
console.log("-".repeat(75));
const sorted = [...bySlot.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [slot, info] of sorted) {
  const minH = Math.min(...info.hours);
  const maxH = Math.max(...info.hours);
  const last = new Date(info.lastTs).toLocaleString("fr-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  console.log(`${String(slot).padStart(4)} | ${String(info.count).padStart(4)} unlocks | ${last.padEnd(22)} | ${minH}h-${maxH}h`);
}

// 3. Aujourd hui specifiquement
console.log("\n=== AUJOURD HUI (events) ===");
const today = new Date().toISOString().slice(0, 10);
const todayLogs = allLogs.filter((l) => new Date(l.event_time).toISOString().slice(0, 10) === today);
console.log(`${todayLogs.length} events aujourd hui :`);
for (const log of todayLogs.sort((a,b) => a.event_time - b.event_time)) {
  const buf = Buffer.from(log.value ?? "", "base64");
  const slot = buf.length >= 4 ? buf.readUInt32BE(0) : "?";
  const time = new Date(log.event_time).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const method = log.code.replace("unlock_", "").replace("_kit", "");
  console.log(`  ${time} | slot=${slot} | ${method}`);
}
