// Karim 2026-05-24 : scan complet sans filtre de codes ni type, pour
// identifier le code reel utilise par les terminaux access control LCD.

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
  ["Accès E", "bfffc2848a716cdeeeglax"],
  ["pointage E", "bfd90b87c696ead286zzxm"],
  ["Pointage ElectroZeyn", "bf82afe3706630c4ff2mtp"],
  ["Pointage C et F", "bf668eaa15b73d5f56nisa"],
  ["Accès Platinum", "bf3984c8a5ba98b929cpgs"],
];

const now = Date.now();
const since = now - 24 * 3600_000; // 24h

for (const [label, id] of DEVICES) {
  console.log(`\n=== ${label} (${id}) ===`);

  // Test 1 : sans filtre codes, tous types
  for (const type of [1, 2, 7]) {
    const path = `/v1.0/devices/${id}/logs?end_time=${now}&size=20&start_time=${since}&type=${type}`;
    const r = await call(tok, "GET", path);
    if (!r.json?.success) {
      console.log(`  type=${type} : echec code=${r.json?.code} msg="${r.json?.msg?.slice(0,40)}"`);
      continue;
    }
    const logs = r.json.result?.logs ?? [];
    if (logs.length === 0) { console.log(`  type=${type} : 0 event`); continue; }
    console.log(`  type=${type} : ${logs.length} event(s)`);
    for (const l of logs.slice(0, 5)) {
      const time = new Date(l.event_time).toLocaleString("fr-BE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
      console.log(`    ${time} | code=${l.code} | event_id=${l.event_id ?? "?"} | value=${(l.value ?? "").slice(0, 30)}`);
    }
  }

  // Test 2 : endpoint v2.0 thing/report-logs avec codes wildcard
  const r2 = await call(tok, "GET", `/v2.0/cloud/thing/${id}/report-logs?end_time=${now}&size=20&start_time=${since}`);
  const ok2 = r2.json?.success;
  if (ok2) {
    const logs = r2.json.result?.logs ?? [];
    console.log(`  v2 report-logs : ${logs.length} event(s)`);
    const codes = new Set(logs.map((l) => l.code));
    if (codes.size > 0) console.log(`    codes uniques : ${[...codes].join(", ")}`);
    for (const l of logs.slice(0, 3)) {
      const time = new Date(l.event_time).toLocaleString("fr-BE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
      console.log(`    ${time} | code=${l.code} | value=${(l.value ?? "").slice(0, 30)}`);
    }
  } else {
    console.log(`  v2 report-logs : echec code=${r2.json?.code} msg="${r2.json?.msg?.slice(0,40)}"`);
  }
}
