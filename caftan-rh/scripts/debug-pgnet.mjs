#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const l of readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue;
  let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log("=== Tables du schema net (pg_net) ===");
const t = await c.query(`select table_name from information_schema.tables where table_schema = 'net' order by table_name`);
console.table(t.rows);

for (const tbl of ["http_request_queue", "_http_response"]) {
  try {
    const cols = await c.query(`select column_name, data_type from information_schema.columns where table_schema='net' and table_name=$1 order by ordinal_position`, [tbl]);
    console.log(`\n=== Colonnes net.${tbl} ===`);
    console.table(cols.rows);
  } catch (e) {
    console.log(`(net.${tbl} introuvable: ${e.message.slice(0, 60)})`);
  }
}

console.log("\n=== net._http_response derniers 5 (toutes colonnes) ===");
try {
  const r = await c.query(`select * from net._http_response order by created desc limit 5`);
  for (const row of r.rows) {
    console.log("---");
    for (const k of Object.keys(row)) {
      const v = row[k];
      const s = typeof v === "string" ? v.slice(0, 120) : v;
      console.log(`  ${k}: ${s}`);
    }
  }
} catch (e) {
  console.log("Erreur :", e.message);
}

console.log("\n=== net.http_request_queue derniers (toutes colonnes) ===");
try {
  const r = await c.query(`select * from net.http_request_queue limit 5`);
  for (const row of r.rows) {
    console.log("---");
    for (const k of Object.keys(row)) {
      const v = row[k];
      const s = typeof v === "string" ? v.slice(0, 120) : v;
      console.log(`  ${k}: ${s}`);
    }
  }
} catch (e) {
  console.log("Erreur :", e.message);
}

await c.end();
