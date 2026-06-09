#!/usr/bin/env node
// Karim 2026-06-09 : insere CRON_SECRET dans app_secrets pour que le trigger
// notif-push puisse l'utiliser dans le Bearer header. Idempotent.
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

await c.query(
  `insert into public.app_secrets (key, value, description)
   values ('cron_secret', $1, 'Used by notify_push_after_insert trigger to call /api/internal/notif-push')
   on conflict (key) do update set value = excluded.value, updated_at = now()`,
  [env.CRON_SECRET]
);

const r = await c.query(`select key, length(value) as len, updated_at from public.app_secrets`);
console.log("app_secrets :");
console.table(r.rows);

await c.end();
