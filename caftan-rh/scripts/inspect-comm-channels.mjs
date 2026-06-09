#!/usr/bin/env node
// Karim 2026-06-09 : cartographie les tables de communication pour
// brancher des notifs push automatiques sur chacune.
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

console.log("=== Tables candidates pour canaux de communication ===");
const tables = await c.query(`
  select table_name
  from information_schema.tables
  where table_schema='public'
    and (
      table_name ~* '(message|chat|conversation|inbox|thread|broadcast|annonce|announcement|mail|notification|comment|sequence)'
    )
  order by table_name
`);
console.table(tables.rows);

for (const { table_name } of tables.rows) {
  const cols = await c.query(`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema='public' and table_name=$1
    order by ordinal_position
  `, [table_name]);
  const cnt = await c.query(`select count(*) as n from public."${table_name}"`);
  console.log(`\n--- public.${table_name} (${cnt.rows[0].n} rows) ---`);
  console.table(cols.rows.map(r => `${r.column_name} ${r.data_type}${r.is_nullable === 'NO' ? ' NOT NULL' : ''}`));
}

console.log("\n=== Triggers existants sur ces tables ===");
const trgs = await c.query(`
  select tgrelid::regclass::text as tbl, tgname
  from pg_trigger
  where not tgisinternal
    and tgrelid::regclass::text ~* '(message|chat|inbox|thread|broadcast|mail|notification)'
  order by tbl, tgname
`);
console.table(trgs.rows);

await c.end();
