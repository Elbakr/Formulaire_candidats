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
const r = await c.query("select count(*) as n, sum(case when is_active then 1 else 0 end)::int as active from public.push_subscriptions");
console.log(`push_subscriptions: total=${r.rows[0].n} active=${r.rows[0].active}`);
const r2 = await c.query("select created_at, last_used_at, is_active, substring(user_agent for 60) as ua, substring(endpoint for 50) as endpoint from public.push_subscriptions order by created_at desc limit 5");
console.table(r2.rows);
const r3 = await c.query("select count(*) as n from public.notifications");
console.log(`notifications table: ${r3.rows[0].n} rows`);
await c.end();
