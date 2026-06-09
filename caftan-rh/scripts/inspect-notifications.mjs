#!/usr/bin/env node
// Karim 2026-06-09 : inspect le schema notifications + qui appelle push deja
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

console.log("=== Columns of public.notifications ===");
const cols = await c.query(`select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='notifications' order by ordinal_position`);
console.table(cols.rows);

console.log("\n=== Existing triggers on notifications ===");
const trg = await c.query(`select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgrelid = 'public.notifications'::regclass and not tgisinternal`);
console.table(trg.rows);

console.log("\n=== pg_net extension present? ===");
const ext = await c.query(`select extname, extversion from pg_extension where extname in ('pg_net','http')`);
console.table(ext.rows);

console.log("\n=== Sample recent notifications (5) ===");
const recent = await c.query(`select id, created_at, profile_id, type, title, substring(message for 60) as msg, is_read from public.notifications order by created_at desc limit 5`);
console.table(recent.rows);

await c.end();
