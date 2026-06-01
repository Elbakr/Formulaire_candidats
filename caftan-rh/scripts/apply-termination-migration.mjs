#!/usr/bin/env node
// Karim 2026-06-01 : applique la migration contract_terminations via
// l API REST Supabase (service_role). Usage :
//   cd caftan-rh && node scripts/apply-termination-migration.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SERVICE) {
  console.error("[X] Missing env");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "../../supabase/migrations/20260620000750_contract_terminations.sql");
const sql = readFileSync(sqlPath, "utf8");

console.log(`Applying migration : ${sqlPath}`);

// Supabase REST endpoint pour exec SQL : /rest/v1/rpc/<fn> ne fonctionne
// que si l on a une fonction exec_sql. A defaut on tente via supabase-js
// avec query brute (non standard) → l alternative est d ouvrir le SQL
// editor du dashboard.
//
// On essaie via l API PG REST proxy si dispo.

import { createClient } from "@supabase/supabase-js";
const supa = createClient(SUPA_URL, SERVICE);

const { error } = await supa.rpc("exec_sql", { sql });
if (error) {
  console.error("[X] exec_sql impossible (probablement function exec_sql absente)");
  console.error("    Solution : copie/colle le contenu de la migration dans");
  console.error("    Supabase Dashboard → SQL Editor → Run");
  console.error("");
  console.error("    Path : " + sqlPath);
  process.exit(1);
}
console.log("✓ Migration applied");
