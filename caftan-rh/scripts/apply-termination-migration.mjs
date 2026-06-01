#!/usr/bin/env node
// Karim 2026-06-01 : applique la migration contract_terminations via
// connexion Postgres directe (DATABASE_URL). Usage :
//   cd caftan-rh && node scripts/apply-termination-migration.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[X] DATABASE_URL missing in .env.local");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "../../supabase/migrations/20260620000750_contract_terminations.sql");
const sql = readFileSync(sqlPath, "utf8");
console.log(`Applying : ${sqlPath}`);
console.log(`(${sql.length} chars)`);

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("✓ Migration applied");
  // Sanity check
  const r = await client.query(`SELECT to_regclass('public.contract_terminations') AS exists`);
  console.log("contract_terminations existe:", r.rows[0].exists);
  const b = await client.query(`SELECT id FROM storage.buckets WHERE id = 'terminations'`);
  console.log("bucket terminations existe:", b.rowCount > 0);
} catch (e) {
  console.error("[X] SQL error:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
