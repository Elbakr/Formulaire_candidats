// Karim 2026-05-24 : cross-map employees CaftanRH sur TOUS les terminaux
// Tuya pointage actifs. Pour chaque employee, cherche son nom dans les
// nicknames Tuya de chaque device pointage (fuzzy match), et cree un mapping
// manquant (tuya_user_id=null, tuya_user_id_alpha rempli). But : consolider
// l historique multi-terminaux sous le meme employee_id.
//
// Usage : node scripts/cross-map-employees.mjs [--dry-run|--apply]

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const APPLY = process.argv.includes("--apply");

const BASE = process.env.TUYA_BASE_URL ?? "https://openapi.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";

function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(k, m) { return crypto.createHmac("sha256", k).update(m, "utf8").digest("hex").toUpperCase(); }
function sortQs(p) { const i = p.indexOf("?"); if (i < 0) return p; const ps = p.slice(i+1).split("&").filter(Boolean); ps.sort((a,b)=>a.split("=")[0].localeCompare(b.split("=")[0])); return p.slice(0,i)+"?"+ps.join("&"); }
function sign(tok, m, u) { const sp = sortQs(u); const t = String(Date.now()), n = crypto.randomUUID(); return { s: hmac(SECRET, CID+tok+t+n+`${m}\n${sha256("")}\n\n${sp}`), t, n, sp }; }
async function call(tok, m, u) { const { s, t, n, sp } = sign(tok, m, u); const h = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce: n }; if (tok) h.access_token = tok; const r = await fetch(BASE + sp, { method: m, headers: h }); return await r.json(); }

const tok = (await call("", "GET", "/v1.0/token?grant_type=1")).result.access_token;
console.log(`Token OK ; mode = ${APPLY ? "APPLY (insert en BD)" : "DRY RUN"}\n`);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// 1. employees actifs
const { rows: emps } = await c.query("select id, full_name from employees where status='active' order by full_name");
console.log(`Employees actifs : ${emps.length}`);

// 2. devices pointage actifs
const { rows: devs } = await c.query("select tuya_device_id, tuya_device_name from tuya_devices where is_active and is_pointage");
console.log(`Devices pointage actifs : ${devs.length}\n`);

// 3. nicknames Tuya par device
const nicksByDev = new Map();
for (const d of devs) {
  const r = await call(tok, "GET", `/v1.0/devices/${d.tuya_device_id}/users`);
  nicksByDev.set(d.tuya_device_id, r.result ?? []);
}

// 4. mappings existants
const { rows: existing } = await c.query("select tuya_device_id, employee_id, tuya_user_id_alpha from tuya_user_mapping where is_active");
const existingKey = new Set(existing.map(r => `${r.tuya_device_id}|${r.employee_id}`));

// 5. fuzzy match avec alias confirmes par Karim
// Karim 2026-05-24 : surnoms intimes des employees -> on les declare
// explicitement pour eviter les faux negatifs du fuzzy match strict.
const ALIASES = {
  "Keltoum El Mrabet": ["Karima"],
  // Karim 2026-05-24 : "Hafida" N EST PAS Hafsa Imachaal — confirme par Karim,
  // ne pas remettre.
  // Karim 2026-05-24 : "salma" est SELMA Maissa, PAS Salima Alaoui.
  // "Saliima" (avec 2 i) c est Salima Alaoui.
  "Salima Alaoui": ["Saliima"],
  "El Bertitan Lina": ["lina 2", "lina2"],
  "Sanae Asaidi": ["sanae IL"],
  "Ibtissem Benoukhita": ["Ibtissam"],
  "Rekimi Doha": ["doha"],
  "Selma Maïssa": ["selma", "salma"],
  "Souad El Aissaouy": ["Souad", "souad"],
  "Ilham Serghini": ["Ilham", "ilhame"],
  "Omaima Ouahi": ["Omaima", "omaima", "oumaima"],
};
function norm(s) { return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function matchScore(empName, nick) {
  const eN = norm(empName);
  const nN = norm(nick);
  if (!nN || nN.length < 2) return 0;
  // Alias explicite Karim -> score max
  const aliases = ALIASES[empName] ?? [];
  for (const a of aliases) if (norm(a) === nN) return 100;
  if (eN === nN) return 100;
  const empTokens = eN.split(" ").filter(t => t.length >= 3);
  for (const t of empTokens) {
    if (t === nN) return 90;
    if (t.startsWith(nN) || nN.startsWith(t)) return 70;
  }
  if (eN.includes(nN) && nN.length >= 4) return 60;
  return 0;
}

// 6. propose mappings
const proposed = [];
for (const emp of emps) {
  for (const d of devs) {
    if (existingKey.has(`${d.tuya_device_id}|${emp.id}`)) continue;
    const nicks = nicksByDev.get(d.tuya_device_id) ?? [];
    let best = null, bestScore = 0;
    for (const n of nicks) {
      const sc = matchScore(emp.full_name, n.nick_name);
      if (sc > bestScore) { bestScore = sc; best = n; }
    }
    if (best && bestScore >= 70) {
      proposed.push({ emp, device: d, nick: best, score: bestScore });
    }
  }
}

console.log("=== Mappings PROPOSES (cross-terminaux) ===");
for (const p of proposed) {
  console.log(`  ${p.emp.full_name.padEnd(30)} | ${p.device.tuya_device_name.padEnd(20)} | "${p.nick.nick_name}" (${p.nick.user_id}) score=${p.score}`);
}

if (APPLY && proposed.length > 0) {
  let inserted = 0, conflicts = 0;
  for (const p of proposed) {
    try {
      const r = await c.query(
        `insert into tuya_user_mapping (tuya_device_id, tuya_user_id, tuya_user_id_alpha, employee_id, direction, tuya_name, is_active)
         values ($1, null, $2, $3, 'in', $4, true)
         on conflict (tuya_device_id, employee_id, direction) do nothing
         returning id`,
        [p.device.tuya_device_id, p.nick.user_id, p.emp.id, p.nick.nick_name],
      );
      if (r.rowCount > 0) inserted++; else conflicts++;
    } catch (e) {
      console.error(`  Insert fail ${p.emp.full_name}/${p.device.tuya_device_id}: ${e.message}`);
    }
  }
  console.log(`\nInserted : ${inserted} | Conflicts (already exist) : ${conflicts}`);
}

await c.end();

if (!APPLY) {
  console.log(`\n=> Pour appliquer : node scripts/cross-map-employees.mjs --apply`);
}
