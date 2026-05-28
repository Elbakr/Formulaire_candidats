// Test pagination - inspect raw API response
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
  return j;
}

const DEVICE = process.argv[2] ?? "bfb90ad2054971aefatjkh";
const start = new Date("2026-05-01T00:00:00Z").getTime();
const end = new Date("2026-05-25T00:00:00Z").getTime();

const codes = "unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit";
let path = `/v1.0/devices/${DEVICE}/logs?codes=${codes}&end_time=${end}&size=50&start_time=${start}&type=7`;
console.log("First call:", path);
const r1 = await tget(path);
console.log("Keys:", Object.keys(r1.result ?? {}));
console.log("has_more:", r1.result?.has_more);
console.log("total:", r1.result?.total);
console.log("last_row_key:", r1.result?.last_row_key);
console.log("count logs:", (r1.result?.logs ?? r1.result?.list ?? []).length);
const list = r1.result?.logs ?? r1.result?.list ?? [];
if (list.length > 0) {
  list.sort((a,b)=>a.event_time-b.event_time);
  console.log("min ts:", new Date(list[0].event_time).toISOString());
  console.log("max ts:", new Date(list[list.length-1].event_time).toISOString());
}

if (r1.result?.has_more && r1.result?.last_row_key) {
  console.log("\nFollow up with last_row_key:");
  const path2 = `/v1.0/devices/${DEVICE}/logs?codes=${codes}&end_time=${end}&last_row_key=${encodeURIComponent(r1.result.last_row_key)}&size=50&start_time=${start}&type=7`;
  const r2 = await tget(path2);
  console.log("has_more:", r2.result?.has_more);
  const list2 = r2.result?.logs ?? r2.result?.list ?? [];
  console.log("count:", list2.length);
  if (list2.length > 0) {
    list2.sort((a,b)=>a.event_time-b.event_time);
    console.log("min ts:", new Date(list2[0].event_time).toISOString());
    console.log("max ts:", new Date(list2[list2.length-1].event_time).toISOString());
  }
}
