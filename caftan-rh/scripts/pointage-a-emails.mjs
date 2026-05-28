// Karim 2026-05-24 : recupere les emails des 14 users Tuya enroles sur
// Pointage A pour faire le match automatique avec les employees CaftanRH.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";
import pg from "pg";

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

// 1. Liste des users
const ru = await call(tok, "GET", `/v1.0/devices/${DEV}/users`);
const users = ru.json?.result ?? [];

// 2. Detail (avec email) de chaque user
console.log("=== USERS TUYA POINTAGE A (avec email) ===");
const tuyaUsers = [];
for (const u of users) {
  const rd = await call(tok, "GET", `/v1.0/devices/${DEV}/users/${u.user_id}`);
  const detail = rd.json?.result ?? {};
  tuyaUsers.push({ ...u, contact: detail.contact ?? "" });
  console.log(`  ${u.user_id} | "${u.nick_name}" | contact=${detail.contact || "(vide)"}`);
}

// 3. Employees CaftanRH
const pgc = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pgc.connect();
const { rows: emps } = await pgc.query("select id, full_name, email, status from employees where status = 'active' order by full_name");
await pgc.end();

console.log(`\n=== ${emps.length} EMPLOYES ACTIFS CAFTANRH ===`);
for (const e of emps) console.log(`  ${e.id.slice(0,8)} | "${e.full_name}" | email=${e.email}`);

// 4. Match par email + par nom
console.log("\n=== MATCHES (email exact ou nom fuzzy) ===");
const norm = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
for (const u of tuyaUsers) {
  let match = null;
  let matchType = "";
  // Match email exact
  if (u.contact) {
    match = emps.find((e) => norm(e.email) === norm(u.contact));
    if (match) matchType = "email exact";
  }
  // Match nom (substring)
  if (!match) {
    const nickN = norm(u.nick_name);
    match = emps.find((e) => {
      const empN = norm(e.full_name);
      return empN.includes(nickN) || nickN.includes(empN.split(" ")[0]) || (nickN.length >= 4 && empN.split(" ").some((t) => t.startsWith(nickN.slice(0,4))));
    });
    if (match) matchType = "nom fuzzy";
  }
  if (match) {
    console.log(`  ✓ "${u.nick_name}" (${u.user_id}) → ${match.full_name} (${matchType})`);
  } else {
    console.log(`  ✗ "${u.nick_name}" (${u.user_id}, contact=${u.contact || "?"}) → AUCUN MATCH`);
  }
}
