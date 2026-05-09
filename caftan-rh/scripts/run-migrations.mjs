#!/usr/bin/env node
// Apply SQL migrations from ../supabase/migrations to the Supabase Postgres DB.
// Tracks applied migrations in `_caftanrh_migrations` table.

import { readFile, readdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing in .env.local");
  process.exit(1);
}

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("Connected to Supabase Postgres.");

  await client.query(`
    create table if not exists _caftanrh_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const { rows: applied } = await client.query(`select filename from _caftanrh_migrations`);
  const appliedSet = new Set(applied.map((r) => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  ✓ ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`→ Applying ${file}…`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(`insert into _caftanrh_migrations (filename) values ($1)`, [file]);
      await client.query("commit");
      console.log(`  ✓ ${file} applied.`);
    } catch (err) {
      await client.query("rollback");
      console.error(`  ✗ ${file} FAILED:`, err.message);
      throw err;
    }
  }

  console.log("All migrations done.");
}

main()
  .catch((e) => {
    console.error("\nMigration error:", e);
    process.exit(1);
  })
  .finally(() => client.end());
