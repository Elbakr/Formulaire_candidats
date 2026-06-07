#!/usr/bin/env node
// Karim 2026-06-07 : applique une migration SQL Supabase via pg (DATABASE_URL).
// Usage : node scripts/apply-migration.mjs supabase/migrations/XXX.sql
// La migration doit etre idempotente (CREATE IF NOT EXISTS, DROP IF EXISTS, etc.)

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL manquant"); process.exit(1); }

const migrationPath = process.argv[2];
if (!migrationPath) { console.error("Usage: apply-migration.mjs <path-to-sql>"); process.exit(1); }

const absPath = resolve(ROOT, migrationPath);
if (!existsSync(absPath)) { console.error(`Migration introuvable: ${absPath}`); process.exit(1); }

const sql = readFileSync(absPath, "utf8");
console.log(`Migration : ${migrationPath} (${sql.length} chars)`);
console.log(`Host       : ${new URL(DATABASE_URL.replace(/^postgres(ql)?:/, "http:")).hostname}`);
console.log("Connexion en cours...");

const { Client } = pg;
const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connecte. Execution de la migration dans une transaction...");
  await client.query("BEGIN");
  try {
    const result = await client.query(sql);
    await client.query("COMMIT");
    console.log("✅ Migration appliquee avec succes.");
    if (Array.isArray(result)) {
      console.log(`   ${result.length} statements executes.`);
    }
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Migration ECHOUEE, rollback effectue.");
    console.error(`   Erreur : ${e.message}`);
    process.exit(1);
  }

  console.log("\nVerification : la table outbound_mails existe-t-elle ?");
  const check = await client.query(`
    SELECT
      table_name,
      (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='outbound_mails') AS col_count,
      (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='outbound_mails') AS policy_count,
      (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_touch_outbound_mails') AS trigger_count
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name='outbound_mails'
  `);
  if (check.rows.length > 0) {
    const r = check.rows[0];
    console.log(`   ✅ Table public.outbound_mails existe`);
    console.log(`   ✅ ${r.col_count} colonnes, ${r.policy_count} RLS policies, ${r.trigger_count} trigger(s)`);
  } else {
    console.log(`   ⚠️ Table public.outbound_mails INTROUVABLE (incoherent)`);
  }

  const rowCount = await client.query("SELECT count(*) as n FROM public.outbound_mails");
  console.log(`   Lignes actuelles : ${rowCount.rows[0].n}`);

} finally {
  await client.end();
}
