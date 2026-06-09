#!/usr/bin/env node
// Karim 2026-06-09 : set le GUC app.cron_secret pour le trigger notif-push
// (lit la valeur depuis .env.local CRON_SECRET).
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
const secret = env.CRON_SECRET;
if (!secret) { console.error("CRON_SECRET manquant"); process.exit(1); }

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// alter database ne supporte pas les params $1, on inline avec quote escape
console.log("ALTER DATABASE postgres SET app.cron_secret ...");
const escaped = secret.replace(/'/g, "''");
try {
  await c.query(`alter database postgres set app.cron_secret = '${escaped}'`);
  console.log("  ✅ OK (alter database)");
} catch (e) {
  console.log("  ❌ KO :", e.message);
  // Fallback : alter role
  try {
    await c.query(`alter role postgres set app.cron_secret = '${escaped}'`);
    console.log("  ✅ OK (alter role postgres)");
  } catch (e2) {
    console.log("  ❌ alter role aussi KO :", e2.message);
  }
}

// Verif via une nouvelle connexion (les GUCs db ne sont pris qu'a la connexion)
await c.end();
const c2 = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c2.connect();
const r = await c2.query(`select current_setting('app.cron_secret', true) as secret`);
const got = r.rows[0].secret;
console.log(`\nGUC app.cron_secret apres reconnexion : ${got ? `present (${got.length} chars)` : "ABSENT"}`);
if (got && got === secret) console.log("✅ match");
else if (got) console.log("⚠️ different");

// Verif trigger
const t = await c2.query(`select tgname from pg_trigger where tgname = 'trg_notify_push_after_insert' and not tgisinternal`);
console.log(`\nTrigger trg_notify_push_after_insert : ${t.rows.length > 0 ? "✅ en place" : "❌ absent"}`);

await c2.end();
