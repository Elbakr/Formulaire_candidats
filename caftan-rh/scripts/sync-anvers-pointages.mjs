#!/usr/bin/env node
// Karim 2026-05-25 : sync complet des pointages Anvers sur 10 jours.
//
// PROBLEME : les events Tuya retournent slot numerique, mais l API
// /devices/{id}/users retourne user_id alpha. Aucune correspondance directe.
//
// STRATEGIE :
// 1. Pull events 10j sur Pointage C et F
// 2. Liste slots uniques + frequence
// 3. Affiche table "slot N -> ? employees" pour mapping manuel via UI
// 4. Si nb slots == nb users (24) ET ordre d enrolement matche : tente
//    un auto-mapping slot[i] = user_alpha[i] (a confirmer par Karim)
//
// Usage : node scripts/sync-anvers-pointages.mjs [--apply-heuristic|--list-only]

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import crypto from "node:crypto";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), override: true });

const APPLY = process.argv.includes("--apply-heuristic");
const DEVICE_CF = "bf668eaa15b73d5f56nisa";
const LOOKBACK_DAYS = 10;

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
console.log(`Mode = ${APPLY ? "APPLY-HEURISTIC" : "LIST-ONLY"}\n`);

// Users enrôlés (ordre = ordre Tuya, typiquement ordre d enrolement)
const usersResp = await call(tok, "GET", `/v1.0/devices/${DEVICE_CF}/users`);
const users = usersResp.result ?? [];
console.log(`Users enroles : ${users.length}`);
users.forEach((u, i) => console.log(`  [${i}] alpha=${u.user_id.padEnd(8)} nick="${u.nick_name}"`));

// Events 10 derniers jours
const now = Date.now();
const since = now - LOOKBACK_DAYS * 86400_000;
const events = [];
let rowKey = "";
for (let page = 0; page < 50; page++) {
  let path = `/v1.0/devices/${DEVICE_CF}/logs?codes=unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit&end_time=${now}&size=50&start_time=${since}&type=7`;
  if (rowKey) path += `&start_row_key=${encodeURIComponent(rowKey)}`;
  const r = await call(tok, "GET", path);
  if (!r.success) break;
  const lst = r.result?.logs ?? [];
  events.push(...lst);
  if (!r.result.has_next || !r.result.next_row_key) break;
  rowKey = r.result.next_row_key;
}
console.log(`\nEvents 10 derniers jours : ${events.length}`);

// Slots + frequence
const slotCount = new Map();
const slotFirstEvent = new Map();
const slotLastEvent = new Map();
for (const ev of events) {
  const buf = Buffer.from(ev.value ?? "", "base64");
  if (buf.length < 4) continue;
  const slot = buf.readUInt32BE(0);
  slotCount.set(slot, (slotCount.get(slot) ?? 0) + 1);
  if (!slotFirstEvent.has(slot) || ev.event_time < slotFirstEvent.get(slot)) slotFirstEvent.set(slot, ev.event_time);
  if (!slotLastEvent.has(slot) || ev.event_time > slotLastEvent.get(slot)) slotLastEvent.set(slot, ev.event_time);
}
const slots = [...slotCount.keys()].sort((a, b) => a - b);
console.log(`\nSlots distincts observes : ${slots.length}`);
slots.forEach((s) => {
  const fd = new Date(slotFirstEvent.get(s)).toISOString().slice(0, 10);
  const ld = new Date(slotLastEvent.get(s)).toISOString().slice(0, 10);
  console.log(`  slot ${String(s).padStart(4)} | ${slotCount.get(s)} events | ${fd} -> ${ld}`);
});

// BD : charge mappings actuels Anvers
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: existingMappings } = await c.query(
  `select m.id, m.tuya_user_id, m.tuya_user_id_alpha, m.employee_id, e.full_name
   from tuya_user_mapping m
   join employees e on e.id = m.employee_id
   where m.tuya_device_id = $1 and m.is_active
   order by e.full_name`,
  [DEVICE_CF],
);

console.log(`\nMappings existants en BD (${existingMappings.length}) :`);
for (const m of existingMappings) {
  console.log(`  alpha=${(m.tuya_user_id_alpha ?? "null").padEnd(8)} | slot=${m.tuya_user_id ?? "NULL"} | ${m.full_name}`);
}

// Heuristique : assume Tuya retourne users dans l ordre des slots (= ordre d enrolement).
// Si nb users == nb slots, on peut tenter slot[i] (chronologique) = users[i].
console.log("\n=== HEURISTIQUE ORDRE D ENROLEMENT ===");
console.log("Hypothese : Tuya retourne /users dans l ordre des slots.");
console.log(`users[0..${users.length-1}] -> slot[0..${slots.length-1}] ?\n`);

const slotsByOrder = slots; // sorted ascending
const mappingPlan = [];
for (let i = 0; i < Math.min(users.length, slotsByOrder.length); i++) {
  const u = users[i];
  const slot = slotsByOrder[i];
  const existing = existingMappings.find((m) => m.tuya_user_id_alpha === u.user_id);
  mappingPlan.push({ slot, alpha: u.user_id, nick: u.nick_name, existing_employee_id: existing?.employee_id, existing_full_name: existing?.full_name, existing_id: existing?.id, has_slot: existing?.tuya_user_id != null });
  console.log(`  slot ${String(slot).padStart(4)} ?<- alpha ${u.user_id.padEnd(8)} "${u.nick_name}" ${existing ? `(emp: ${existing.full_name}${existing.tuya_user_id ? ` slot=${existing.tuya_user_id} OK` : " <- a remplir"})` : "(pas de mapping alpha trouve)"}`);
}

if (!APPLY) {
  console.log("\n=> Pour appliquer l heuristique : node scripts/sync-anvers-pointages.mjs --apply-heuristic");
  await c.end();
  process.exit(0);
}

// APPLY : update tuya_user_id (slot) sur les mappings existants
let updated = 0, skipped = 0;
for (const p of mappingPlan) {
  if (!p.existing_id || p.has_slot) { skipped++; continue; }
  await c.query(
    "update tuya_user_mapping set tuya_user_id = $1 where id = $2",
    [String(p.slot), p.existing_id],
  );
  updated++;
  console.log(`  updated ${p.existing_full_name}: slot=${p.slot}`);
}
console.log(`\n=== RESUME ===`);
console.log(`Mappings mis a jour avec slot : ${updated}`);
console.log(`Skipped (deja un slot ou pas de mapping alpha) : ${skipped}`);

await c.end();
