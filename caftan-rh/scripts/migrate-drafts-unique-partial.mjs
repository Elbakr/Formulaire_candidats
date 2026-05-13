// Migration : remplace la contrainte unique (site_id, week_monday, status)
// par un partial unique index UNIQUE(site_id, week_monday) WHERE status='pending'.
// Karim 2026-05-13 : permet plusieurs 'approved' / 'rolled_back' sur le meme
// (site, semaine) sans bloquer les re-essais de generation.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log(`\n=== Migration auto_plan_drafts unique partial (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

// Check si la contrainte existe encore
const { rows: cstr } = await c.query(`
  select conname from pg_constraint c join pg_class t on t.oid = c.conrelid
  where t.relname = 'auto_plan_drafts' and conname = 'auto_plan_drafts_site_id_week_monday_status_key'
`);
if (cstr.length > 0) {
  console.log("Suppression de la contrainte stricte (site_id, week_monday, status)");
  if (APPLY) {
    await c.query(`alter table auto_plan_drafts drop constraint auto_plan_drafts_site_id_week_monday_status_key`);
  }
} else {
  console.log("Contrainte stricte deja absente.");
}

// Check si le partial index existe
const { rows: idx } = await c.query(`
  select indexname from pg_indexes where tablename='auto_plan_drafts' and indexname='auto_plan_drafts_unique_pending'
`);
if (idx.length === 0) {
  console.log("Creation partial unique index : UNIQUE(site_id, week_monday) WHERE status='pending'");
  if (APPLY) {
    await c.query(
      `create unique index auto_plan_drafts_unique_pending on auto_plan_drafts (site_id, week_monday) where status = 'pending'`,
    );
  }
} else {
  console.log("Partial index deja present.");
}

console.log(`\n${APPLY ? "✅" : "[DRY-RUN]"}`);
await c.end();
