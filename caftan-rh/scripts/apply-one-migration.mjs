#!/usr/bin/env node
// Applique UNE seule migration SQL par son nom de fichier (sans rejouer les
// autres), et l'enregistre dans `_caftanrh_migrations`. Utile quand le tracker
// est désynchronisé de la prod (migrations appliquées via le dashboard Supabase
// et non enregistrées) : `npm run migrate` rejouerait tout, ce script non.
//
// Usage : node scripts/apply-one-migration.mjs 20260620000860_incidents.sql

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-one-migration.mjs <filename.sql>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquant dans .env.local");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "../../supabase/migrations", file);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  await client.query(`
    create table if not exists _caftanrh_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const { rows: already } = await client.query(
    `select 1 from _caftanrh_migrations where filename = $1`, [file],
  );
  if (already.length) {
    console.log(`✓ ${file} déjà enregistrée — rien à faire.`);
    return;
  }
  const sql = await readFile(sqlPath, "utf8");
  console.log(`→ Application de ${file}…`);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query(`insert into _caftanrh_migrations (filename) values ($1)`, [file]);
    await client.query("commit");
    console.log(`✓ ${file} appliquée et enregistrée.`);
  } catch (err) {
    await client.query("rollback");
    console.error(`✗ ÉCHEC ${file} :`, err.message);
    process.exit(1);
  }
}

main()
  .catch((e) => { console.error("Erreur :", e.message); process.exit(1); })
  .finally(() => client.end());
