// Karim 2026-05-24 : recupere les noms enroles sur les 5 devices mk (LCD)
// pour identifier definitivement quel device est Pointage A / E / C+F / etc.

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
  ["bfffc2848a716cdeeeglax", "mk - actuellement Pointage A (suspect)"],
  ["bfd90b87c696ead286zzxm", "mk - Pointage E"],
  ["bf82afe3706630c4ff2mtp", "mk - Pointage ElectroZeyn"],
  ["bf668eaa15b73d5f56nisa", "mk - Pointage C et F"],
  ["bf3984c8a5ba98b929cpgs", "mk - Acces Platinum"],
  ["60422568bcff4d095350",   "ms - Acces Bureau A"],
  ["bf7a05702d14cf4b6aulkq", "ms - Platinum Depot Porte verte"],
  ["bfd6a211e7b75f69e5vlzs", "ms - Acces stock E"],
  ["bf971f85d8394f8222otkj", "ms - Acces escalier E"],
];

for (const [id, label] of DEVICES) {
  console.log(`\n========== ${id} (${label}) ==========`);
  const r = await call(tok, "GET", `/v1.0/devices/${id}/users`);
  if (!r.json?.success) {
    console.log(`  ECHEC code=${r.json?.code} msg="${r.json?.msg}"`);
    continue;
  }
  const users = r.json.result ?? [];
  console.log(`  ${users.length} user(s) enroles :`);
  for (const u of users) {
    console.log(`    ${u.user_id} | "${u.nick_name}"`);
  }
}
