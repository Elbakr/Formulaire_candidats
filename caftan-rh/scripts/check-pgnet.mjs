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

console.log("Tentative d'activation pg_net (idempotent)...");
try {
  await c.query("create extension if not exists pg_net with schema extensions");
  console.log("✅ pg_net active (ou deja present)");
} catch (e) {
  console.log("❌ pg_net non activable :", e.message);
}

console.log("\nVerification :");
const ext = await c.query(`select extname, extversion, extnamespace::regnamespace as schema from pg_extension where extname='pg_net'`);
console.table(ext.rows);

if (ext.rows.length > 0) {
  console.log("\nTest http_post (vers httpbin.org) ...");
  try {
    const r = await c.query(`select net.http_post(url := 'https://httpbin.org/post', body := '{"test":1}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb) as request_id`);
    console.log("✅ http_post OK, request_id:", r.rows[0].request_id);
  } catch (e) {
    console.log("❌ http_post erreur :", e.message);
  }
}

await c.end();
