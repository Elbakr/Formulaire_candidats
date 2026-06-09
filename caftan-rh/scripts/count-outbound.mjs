#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const env = {};
for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue;
  let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const total = await c.query("select count(*) as n, max(sent_at) as last from public.outbound_mails");
console.log(`Total: ${total.rows[0].n} | last: ${total.rows[0].last}`);
const grp = await c.query("select source, delivery_provider, status, count(*) as n from public.outbound_mails group by source, delivery_provider, status order by n desc limit 15");
console.table(grp.rows);
const recent = await c.query("select sent_at, recipient_email, source, delivery_provider, status from public.outbound_mails order by sent_at desc limit 5");
console.log("\nLast 5:");
console.table(recent.rows);
await c.end();
