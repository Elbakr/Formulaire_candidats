// Karim 2026-05-24 : recherche les noms specifiques que Karim a cites pour
// Site A dans les listes de noms enroles sur les 9 devices.

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

const TARGETS = ["salima", "salma", "lina", "ibtissem", "ibtissam", "sanae", "asaidi", "hafsa", "hafida", "omaima"];

const DEVICES = [
  ["bfffc2848a716cdeeeglax", "mk"],
  ["bfd90b87c696ead286zzxm", "mk"],
  ["bf82afe3706630c4ff2mtp", "mk"],
  ["bf668eaa15b73d5f56nisa", "mk"],
  ["bf3984c8a5ba98b929cpgs", "mk"],
];

const matchesByName = {};
for (const t of TARGETS) matchesByName[t] = [];

for (const [id, type] of DEVICES) {
  const r = await call(tok, "GET", `/v1.0/devices/${id}/users`);
  if (!r.json?.success) continue;
  const users = r.json.result ?? [];
  for (const u of users) {
    const nameLower = u.nick_name.toLowerCase();
    for (const t of TARGETS) {
      if (nameLower.includes(t)) {
        matchesByName[t].push({ device: id, name: u.nick_name, user_id: u.user_id });
      }
    }
  }
}

console.log("=== Matches par nom recherche ===\n");
for (const [target, matches] of Object.entries(matchesByName)) {
  if (matches.length === 0) {
    console.log(`✗ "${target}" : aucun match`);
  } else {
    console.log(`✓ "${target}" :`);
    for (const m of matches) console.log(`    ${m.device} | "${m.name}" | user_id=${m.user_id}`);
  }
}
