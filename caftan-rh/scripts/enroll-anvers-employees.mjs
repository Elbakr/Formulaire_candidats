// Karim 2026-05-25 : auto-enrolement des employees Anvers a partir des
// nicknames Tuya enrolés sur "Pointage C et F" qui ont pointe dans les 10
// derniers jours. Cree un employee_id CaftanRH "{nick} Anvers" + mapping
// Tuya name-based + site_assignment site C (par defaut, modifiable apres).
//
// Usage : node scripts/enroll-anvers-employees.mjs [--dry-run|--apply]

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const APPLY = process.argv.includes("--apply");
const DEVICE_CF = "bf668eaa15b73d5f56nisa"; // Pointage C et F

const BASE = process.env.TUYA_BASE_URL ?? "https://openapi.tuyaeu.com";
const CID = process.env.TUYA_CLIENT_ID ?? "";
const SECRET = process.env.TUYA_CLIENT_SECRET ?? "";

function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(k, m) { return crypto.createHmac("sha256", k).update(m, "utf8").digest("hex").toUpperCase(); }
function sortQs(p) { const i = p.indexOf("?"); if (i < 0) return p; const ps = p.slice(i+1).split("&").filter(Boolean); ps.sort((a,b)=>a.split("=")[0].localeCompare(b.split("=")[0])); return p.slice(0,i)+"?"+ps.join("&"); }
function sign(tok, m, u) { const sp = sortQs(u); const t = String(Date.now()), n = crypto.randomUUID(); return { s: hmac(SECRET, CID+tok+t+n+`${m}\n${sha256("")}\n\n${sp}`), t, n, sp }; }
async function call(tok, m, u) {
  const { s, t, n, sp } = sign(tok, m, u);
  const h = { client_id: CID, sign: s, t, sign_method: "HMAC-SHA256", nonce: n };
  if (tok) h.access_token = tok;
  const r = await fetch(BASE + sp, { method: m, headers: h });
  return await r.json();
}

const tok = (await call("", "GET", "/v1.0/token?grant_type=1")).result.access_token;
console.log(`Token OK, mode = ${APPLY ? "APPLY" : "DRY RUN"}\n`);

// 1. Recupere les users enrôlés sur Pointage C et F (avec nick)
const usersResp = await call(tok, "GET", `/v1.0/devices/${DEVICE_CF}/users`);
const allUsers = usersResp.result ?? [];
console.log(`Users enroles sur Pointage C et F : ${allUsers.length}`);

// 2. Recupere les events des 10 derniers jours pour identifier les slots actifs
const now = Date.now();
const since = now - 10 * 86400_000;
const events = [];
let rowKey = "";
for (let page = 0; page < 30; page++) {
  let path = `/v1.0/devices/${DEVICE_CF}/logs?codes=unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit&end_time=${now}&size=50&start_time=${since}&type=7`;
  if (rowKey) path += `&start_row_key=${encodeURIComponent(rowKey)}`;
  const r = await call(tok, "GET", path);
  if (!r.success) break;
  const lst = r.result?.logs ?? [];
  events.push(...lst);
  if (!r.result.has_next || !r.result.next_row_key) break;
  rowKey = r.result.next_row_key;
}
console.log(`Events 10 derniers jours : ${events.length}`);

const activeSlots = new Set();
for (const ev of events) {
  const buf = Buffer.from(ev.value ?? "", "base64");
  if (buf.length >= 4) activeSlots.add(buf.readUInt32BE(0));
}
console.log(`Slots actifs : ${activeSlots.size}\n`);

// 3. Pour les nicknames qui ont des slots actifs : essayer de matcher
//    user_id alpha <-> slot. Comme on n a pas la correspondance directe,
//    on enrôle TOUS les nicknames pour ne rien rater (Karim pourra archiver
//    les inactifs plus tard via UI).
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// Recupere employees existants pour eviter doublons
const { rows: existing } = await c.query("select full_name from employees where status = 'active'");
const existingNames = new Set(existing.map(r => r.full_name.toLowerCase()));

// site C
const { rows: siteRows } = await c.query("select id, code from sites where code in ('C', 'F')");
const siteCId = siteRows.find(r => r.code === 'C')?.id;
const siteFId = siteRows.find(r => r.code === 'F')?.id;
if (!siteCId) { console.error("Site C introuvable"); process.exit(1); }

// Recupere mappings existants pour ce device
const { rows: mappings } = await c.query(
  "select tuya_user_id_alpha from tuya_user_mapping where tuya_device_id = $1 and is_active",
  [DEVICE_CF],
);
const mappedAlphas = new Set(mappings.map(m => m.tuya_user_id_alpha).filter(Boolean));

// Verifier que sites C/F sont actifs (sinon Karim devra les reactiver pour
// que les pointages remontent)
const { rows: siteStatus } = await c.query("select code, is_active from sites where code in ('C', 'F')");
console.log("Statut sites Anvers :");
for (const r of siteStatus) console.log(`  ${r.code} : ${r.is_active ? "ACTIF" : "DESACTIVE (a reactiver pour le polling)"}`);

console.log(`\nNicknames a enroler (${allUsers.length} total, ${mappedAlphas.size} deja mappes) :`);
const toEnroll = [];
for (const u of allUsers) {
  if (mappedAlphas.has(u.user_id)) continue; // deja mappe
  const targetName = `${u.nick_name} Anvers`;
  const alreadyExists = existingNames.has(targetName.toLowerCase());
  toEnroll.push({ alpha: u.user_id, nick: u.nick_name, target_name: targetName, exists: alreadyExists });
  console.log(`  ${alreadyExists ? "↻" : "+"} ${u.user_id.padEnd(8)} | "${u.nick_name}" -> "${targetName}"${alreadyExists ? " (existe deja)" : ""}`);
}

if (toEnroll.length === 0) {
  console.log("\nRien a enroler.");
  await c.end();
  process.exit(0);
}

if (!APPLY) {
  console.log(`\n=> Pour appliquer : node scripts/enroll-anvers-employees.mjs --apply`);
  await c.end();
  process.exit(0);
}

// 4. INSERT employees + site_assignments + tuya_user_mapping
let createdEmps = 0, reusedEmps = 0, mappingsCreated = 0;
for (const item of toEnroll) {
  let empId;
  if (item.exists) {
    const { rows: r } = await c.query("select id from employees where lower(full_name) = lower($1) limit 1", [item.target_name]);
    empId = r[0]?.id;
    reusedEmps++;
  } else {
    const slug = item.alpha.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const placeholderEmail = `tuya-${slug}-anvers@local.caftanrh`;
    // pas d unique constraint sur email -> check avant insert
    const { rows: existEmail } = await c.query("select id from employees where email = $1 limit 1", [placeholderEmail]);
    const r = existEmail.length > 0
      ? { rows: existEmail }
      : await c.query(
          `insert into employees (email, full_name, job_title, contract_type, weekly_hours, start_date, status)
           values ($1, $2, 'À définir', 'CDI', 38, current_date, 'active')
           returning id`,
          [placeholderEmail, item.target_name],
        );
    if (r[0]) {
      empId = r[0].id;
      createdEmps++;
      // site_assignment site C par defaut (check si existe deja avant insert)
      const { rows: existingAssign } = await c.query(
        "select id from site_assignments where employee_id = $1 and site_id = $2 and (end_date is null or end_date >= current_date)",
        [empId, siteCId],
      );
      if (existingAssign.length === 0) {
        await c.query(
          `insert into site_assignments (employee_id, site_id, start_date, is_primary)
           values ($1, $2, current_date, true)`,
          [empId, siteCId],
        );
      }
    }
  }
  if (!empId) continue;
  // tuya_user_mapping name-based (alpha) - check si existe avant insert
  try {
    const { rows: exMap } = await c.query(
      "select id from tuya_user_mapping where tuya_device_id = $1 and employee_id = $2 and direction = 'in'",
      [DEVICE_CF, empId],
    );
    if (exMap.length === 0) {
      await c.query(
        `insert into tuya_user_mapping (tuya_device_id, tuya_user_id, tuya_user_id_alpha, employee_id, direction, tuya_name, is_active)
         values ($1, null, $2, $3, 'in', $4, true)`,
        [DEVICE_CF, item.alpha, empId, item.nick],
      );
      mappingsCreated++;
    }
  } catch (e) {
    console.log(`  Mapping fail ${item.target_name}: ${e.message}`);
  }
}

console.log(`\n=== RESUME ===`);
console.log(`Employees crees : ${createdEmps}`);
console.log(`Employees re-utilises : ${reusedEmps}`);
console.log(`Mappings Tuya inseres : ${mappingsCreated}`);
console.log(`Site assignment par defaut : C (Karim pourra reaffecter a F via UI)`);

await c.end();
