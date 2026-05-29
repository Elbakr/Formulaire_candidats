#!/usr/bin/env node
// Karim 2026-05-29 : genere la migration SQL v7 a partir de la BD locale
// (deja mise a jour via le script de transformation).

import pg from "pg";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

let sql = `-- Karim 2026-05-29 : nettoyage contrats v7
-- 1. Retire le bloc duplique "Fait en deux exemplaires + Signatures + Parapher"
--    (les signatures sont apposees par le HTML wrapper docuseal-flow.ts)
-- 2. Retire "*Biffer la mention inutile*" (obsolete en e-signature)
-- 3. Retire "*(et parapher toutes les pages)*" (pas obligatoire BE + audit
--    log crypto DocuSeal equivaut)
-- 4. Coche horaire VARIABLE par defaut (vs horaire fixe avant) pour
--    employee, employee_pt, student

`;

for (const code of ["employee", "employee_pt", "student"]) {
  const { rows } = await c.query("select body_markdown from contract_templates where code = $1", [code]);
  // Utilise dollar-quoting pour eviter d echapper les apostrophes
  sql += `\nupdate public.contract_templates set body_markdown = $contract_v7$${rows[0].body_markdown}$contract_v7$, updated_at = now() where code = '${code}';\n`;
}

writeFileSync(resolve(__dirname, "../../supabase/migrations/20260620000550_contracts_no_paraph_no_biffer_v7.sql"), sql);
writeFileSync(resolve(__dirname, "../supabase/migrations/20260620000550_contracts_no_paraph_no_biffer_v7.sql"), sql);
console.log(`Migration SQL ecrite (${sql.length} chars)`);
await c.end();
