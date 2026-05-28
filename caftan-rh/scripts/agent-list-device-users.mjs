// Agent autonome : list users enroles sur Pointage A et E (alpha IDs + nicks)
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

for (const dev of [
  { id: "bfb90ad2054971aefatjkh", name: "Pointage A" },
  { id: "bfd90b87c696ead286zzxm", name: "Pointage E" },
]) {
  console.log(`\n=== ${dev.name} (${dev.id}) ===`);
  try {
    const users = await tget(`/v1.0/devices/${dev.id}/users`);
    console.log(`Total users: ${(users ?? []).length}`);
    for (const u of users ?? []) {
      console.log(`  user_id=${u.user_id} | nick="${u.nick_name}"`);
    }
  } catch (e) {
    console.error("err:", e.message);
  }
}
