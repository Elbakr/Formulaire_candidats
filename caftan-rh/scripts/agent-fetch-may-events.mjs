// Agent autonome 2026-05-24 : recupere TOUS les events Tuya sur Pointage A et E
// du 1er au 24 mai 2026, et affiche distribution par slot.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const BASE = process.env.TUYA_BASE_URL ?? "https://openapi.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID;
const CSEC = process.env.TUYA_CLIENT_SECRET;

let cachedToken = null;

function sha256Hex(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(key, msg) { return crypto.createHmac("sha256", key).update(msg, "utf8").digest("hex").toUpperCase(); }
function sortQS(p) {
  const i = p.indexOf("?"); if (i < 0) return p;
  const path = p.slice(0, i); const qs = p.slice(i+1); if (!qs) return p;
  return path + "?" + qs.split("&").sort((a,b)=>a.split("=")[0].localeCompare(b.split("=")[0])).join("&");
}
function sign({ accessToken, method, urlPath, body, t, nonce }) {
  const stringToSign = `${method}\n${sha256Hex(body)}\n\n${urlPath}`;
  return hmac(CSEC, CID + accessToken + t + nonce + stringToSign);
}
function headers({ accessToken, method, urlPath, body }) {
  const t = String(Date.now());
  const nonce = crypto.randomUUID();
  const s = sign({ accessToken, method, urlPath, body, t, nonce });
  const h = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce, "Content-Type": "application/json" };
  if (accessToken) h.access_token = accessToken;
  return h;
}
async function token() {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.tok;
  const p = "/v1.0/token?grant_type=1";
  const r = await fetch(BASE + p, { method: "GET", headers: headers({ accessToken: "", method: "GET", urlPath: p, body: "" }) });
  const j = await r.json();
  if (!j.success) throw new Error("Token: " + j.msg);
  cachedToken = { tok: j.result.access_token, exp: Date.now() + j.result.expire_time * 1000 };
  return cachedToken.tok;
}
async function tget(pathWithQ) {
  const tok = await token();
  const sp = sortQS(pathWithQ);
  const r = await fetch(BASE + sp, { method: "GET", headers: headers({ accessToken: tok, method: "GET", urlPath: sp, body: "" }) });
  const j = await r.json();
  if (!j.success) throw new Error("API " + sp + " err: " + j.msg + " code=" + j.code);
  return j.result;
}

function parseValue(b64, code) {
  let buf;
  try { buf = Buffer.from(b64, "base64"); } catch { return {}; }
  if (code && code.endsWith("_kit") && buf.length >= 4) {
    return { uid: buf.readUInt32BE(0), method: code.replace(/^unlock_|_kit$/g, "") };
  }
  if (buf.length >= 12) {
    return { uid: buf.readUInt32BE(8), method: buf[1] };
  }
  return {};
}

async function fetchAllLogs(deviceId, startMs, endMs) {
  // Tuya v1.0 logs uses cursor pagination via has_next / next_row_key.
  const all = [];
  const seen = new Set();
  let rowKey = null;
  let safety = 0;
  const codes = "unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit";
  while (safety < 500) {
    safety++;
    let path = `/v1.0/devices/${deviceId}/logs?codes=${codes}&end_time=${endMs}&size=50&start_time=${startMs}&type=7`;
    if (rowKey) path += `&start_row_key=${encodeURIComponent(rowKey)}`;
    const r = await tget(path);
    const list = r?.logs ?? r?.list ?? [];
    for (const l of list) {
      const key = `${l.event_time}_${l.value}_${l.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(l);
    }
    const hasNext = r?.has_next;
    const nextKey = r?.next_row_key;
    if (!hasNext || !nextKey) break;
    rowKey = nextKey;
  }
  return all;
}

const DEVICE_A = "bfb90ad2054971aefatjkh";
const DEVICE_E = "bfd90b87c696ead286zzxm";

const START = new Date("2026-05-01T00:00:00Z").getTime();
const END = new Date("2026-05-25T00:00:00Z").getTime();

console.log(`Period: ${new Date(START).toISOString()} -> ${new Date(END).toISOString()}`);

for (const dev of [
  { id: DEVICE_A, name: "Pointage A" },
  { id: DEVICE_E, name: "Pointage E" },
]) {
  console.log(`\n=== ${dev.name} (${dev.id}) ===`);
  const logs = await fetchAllLogs(dev.id, START, END);
  console.log(`Total events fetched: ${logs.length}`);
  // Group by slot
  const bySlot = new Map();
  for (const l of logs) {
    const v = parseValue(l.value, l.code);
    if (v.uid == null) continue;
    const arr = bySlot.get(v.uid) ?? [];
    arr.push({ ts: l.event_time, code: l.code });
    bySlot.set(v.uid, arr);
  }
  const slots = [...bySlot.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`Distinct slots: ${slots.length}`);
  for (const [slot, evs] of slots) {
    evs.sort((a, b) => a.ts - b.ts);
    const days = new Set(evs.map(e => new Date(e.ts).toISOString().slice(0,10)));
    // Compute typical hours
    const hours = evs.map(e => {
      const d = new Date(e.ts);
      return d.getUTCHours() + (d.getUTCMinutes() / 60);
    });
    const avgH = hours.reduce((a,b)=>a+b, 0) / hours.length;
    const minH = Math.min(...hours).toFixed(1);
    const maxH = Math.max(...hours).toFixed(1);
    // First/last days
    const sortedDays = [...days].sort();
    console.log(`  slot=${String(slot).padStart(4)} | ${evs.length} events | ${days.size} days | h:${minH}-${maxH} avg=${avgH.toFixed(1)} | ${sortedDays[0]} -> ${sortedDays[sortedDays.length-1]}`);
  }

  // Also write to a file for later analysis
  const fs = await import("node:fs");
  const out = logs.map(l => ({
    ts: l.event_time,
    iso: new Date(l.event_time).toISOString(),
    code: l.code,
    ...parseValue(l.value, l.code),
  }));
  fs.writeFileSync(resolve(__dirname, `../tmp-${dev.id}-events.json`), JSON.stringify(out, null, 2));
  console.log(`Saved to tmp-${dev.id}-events.json`);
}

console.log("\nDone.");
