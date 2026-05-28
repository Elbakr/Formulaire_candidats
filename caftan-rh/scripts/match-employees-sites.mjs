// Karim 2026-05-24 : recupere TOUS les employes actifs CaftanRH avec leur
// site assignment, puis cherche chaque nom dans les users enroles sur les
// 5 devices mk Tuya. Determine de facon DEFINITIVE quel device = quel site.

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

// Normalise pour le match : minuscules, retire accents et espaces multiples
function norm(s) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Tokenize en mots significatifs pour fuzzy match
function tokens(s) {
  return norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

// Score un match employe <-> nick_name. Plus haut = meilleur match.
function matchScore(empName, tuyaName) {
  const empN = norm(empName);
  const tuyaN = norm(tuyaName);
  if (empN === tuyaN) return 100;
  if (empN.includes(tuyaN) || tuyaN.includes(empN)) return 80;
  const empT = tokens(empName);
  const tuyaT = tokens(tuyaName);
  let common = 0;
  for (const t of tuyaT) {
    if (empT.some((e) => e.startsWith(t) || t.startsWith(e))) common++;
  }
  return common > 0 ? common * 30 : 0;
}

const tokRes = await call("", "GET", "/v1.0/token?grant_type=1");
const tok = tokRes.json?.result?.access_token;
console.log("Token OK\n");

// 1. Recupere employes CaftanRH + site
const pgc = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pgc.connect();
const { rows: emps } = await pgc.query(`
  select e.id, e.full_name, e.status,
         s.code as site_code, s.name as site_name
  from employees e
  left join site_assignments sa on sa.employee_id = e.id and sa.is_primary
    and sa.start_date <= current_date
    and (sa.end_date is null or sa.end_date >= current_date)
  left join sites s on s.id = sa.site_id
  where e.status = 'active'
  order by s.code nulls last, e.full_name
`);
console.log(`=== ${emps.length} employes actifs CaftanRH ===\n`);

// 2. Recupere users de chaque device mk
const DEVICES = [
  ["bfffc2848a716cdeeeglax", "anciennement Acces E"],
  ["bfd90b87c696ead286zzxm", "anciennement pointage E"],
  ["bf82afe3706630c4ff2mtp", "ElectroZeyn"],
  ["bf668eaa15b73d5f56nisa", "Pointage C et F"],
  ["bf3984c8a5ba98b929cpgs", "Acces Platinum"],
];

const usersByDevice = {};
for (const [id] of DEVICES) {
  const r = await call(tok, "GET", `/v1.0/devices/${id}/users`);
  usersByDevice[id] = r.json?.success ? (r.json.result ?? []) : [];
}

// 3. Pour chaque employe, cherche le meilleur match sur chaque device
console.log("EMPLOYE CaftanRH                    | SITE | MEILLEUR MATCH TUYA");
console.log("-".repeat(95));
const matchesByDeviceSite = {}; // devId -> { site -> count }
for (const emp of emps) {
  let bestMatch = null;
  let bestScore = 0;
  let bestDev = null;
  for (const [devId] of DEVICES) {
    for (const u of usersByDevice[devId]) {
      const score = matchScore(emp.full_name, u.nick_name);
      if (score > bestScore) {
        bestScore = score; bestMatch = u; bestDev = devId;
      }
    }
  }
  const matchInfo = bestMatch && bestScore >= 30
    ? `[${bestScore}] ${bestDev.slice(0,12)} "${bestMatch.nick_name}"`
    : "(aucun match)";
  console.log(`${emp.full_name.padEnd(36)} | ${(emp.site_code ?? "?").padEnd(4)} | ${matchInfo}`);
  if (bestDev && bestScore >= 30 && emp.site_code) {
    matchesByDeviceSite[bestDev] = matchesByDeviceSite[bestDev] ?? {};
    matchesByDeviceSite[bestDev][emp.site_code] = (matchesByDeviceSite[bestDev][emp.site_code] ?? 0) + 1;
  }
}

console.log("\n=== Distribution device -> sites des employes matches ===");
for (const [devId, byS] of Object.entries(matchesByDeviceSite)) {
  const counts = Object.entries(byS).map(([s, c]) => `${s}=${c}`).join(", ");
  const totalUsers = usersByDevice[devId].length;
  console.log(`  ${devId} (${totalUsers} users enroles) : ${counts}`);
}

await pgc.end();
