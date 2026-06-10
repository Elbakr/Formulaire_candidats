#!/usr/bin/env node
// Verif LECTURE SEULE : compare clock_sessions (toutes sources) vs
// clock_sessions_billing (Tuya-first) sur 14j. Confirme que le web ne
// double-compte plus les jours avec Tuya. Karim 2026-06-10.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { let v = m[2]; if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); env[m[1]] = v; }
}
const { Client } = pg;
const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const q = async (sql) => (await client.query(sql)).rows;

const all = await q(`
  select coalesce(round(sum(duration_minutes)/60.0, 1), 0) as h, count(*) as sessions
  from clock_sessions
  where clock_in_at >= now() - interval '14 days' and duration_minutes is not null`);
const bill = await q(`
  select coalesce(round(sum(duration_minutes)/60.0, 1), 0) as h, count(*) as sessions
  from clock_sessions_billing
  where clock_in_at >= now() - interval '14 days' and duration_minutes is not null`);

console.log("HEURES TOTALES 14j (sessions cloturees)");
console.log(`  clock_sessions (toutes sources) : ${all[0].h}h  (${all[0].sessions} sessions)`);
console.log(`  clock_sessions_billing (Tuya-1st): ${bill[0].h}h  (${bill[0].sessions} sessions)`);
console.log(`  ecart : ${(all[0].h - bill[0].h).toFixed(1)}h retire du decompte (web double sur jours Tuya)`);

const bySource = await q(`
  select source, count(*) n
  from clock_sessions_billing
  where clock_in_at >= now() - interval '14 days'
  group by source order by n desc`);
console.log("\nSessions facturables par source :");
for (const r of bySource) console.log(`  ${(r.source ?? "?").padEnd(14)} ${r.n}`);

// Sanity : duration negatives ou aberrantes ?
const bad = await q(`
  select count(*) n from clock_sessions_billing
  where duration_minutes is not null and (duration_minutes < 0 or duration_minutes > 16*60)`);
console.log(`\nSessions aberrantes (<0 ou >16h) : ${bad[0].n}`);

await client.end();
