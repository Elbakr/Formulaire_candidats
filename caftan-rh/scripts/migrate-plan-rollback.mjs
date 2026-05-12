// Migration idempotente : auto_plan_drafts.applied_snapshot_json + applied_at + rolled_back_at.
// Permet de tracer les drafts effectivement appliques (basculer dans shifts)
// et de supporter un rollback en 1 clic dans les 24h.

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

console.log(`\n=== Migration plan rollback (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

async function addCol(name, def) {
  const { rows } = await c.query(
    `select 1 from information_schema.columns
     where table_name='auto_plan_drafts' and column_name=$1`,
    [name],
  );
  if (rows.length > 0) {
    console.log(`  [${name}] deja present ✓`);
    return;
  }
  console.log(`  [${name}] ajout : ${def}`);
  if (APPLY) await c.query(`alter table auto_plan_drafts add column ${name} ${def}`);
}

await addCol("applied_snapshot_json", "jsonb null");
await addCol("applied_at", "timestamptz null");
await addCol("rolled_back_at", "timestamptz null");

if (APPLY) {
  await c.query(
    `comment on column auto_plan_drafts.applied_snapshot_json is
     '{new_shift_ids:[...], existing_shift_ids:[...]} - snapshot pris a l''application du draft, sert au rollback.'`,
  );
}

console.log(`\n${APPLY ? "✅" : "[DRY-RUN]"}`);
await c.end();
