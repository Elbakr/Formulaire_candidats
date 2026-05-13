// Active RLS sur _caftanrh_migrations (signale critique par Supabase Advisor).
// Aucune policy = aucun acces via PostgREST/anon-key. Le script
// run-migrations.mjs continue de marcher car il utilise une connexion pg
// directe avec le DATABASE_URL (privileges complets, bypasse RLS).

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

const { rows: state } = await c.query(`
  select relrowsecurity from pg_class
  where relname = '_caftanrh_migrations' and relnamespace = (select oid from pg_namespace where nspname='public')
`);
console.log(`RLS actuel sur _caftanrh_migrations : ${state[0]?.relrowsecurity ? "active" : "INACTIVE"}`);

if (state[0]?.relrowsecurity) {
  console.log("Deja OK, rien a faire.");
  await c.end();
  process.exit(0);
}

if (!APPLY) {
  console.log("\n[DRY-RUN] Va executer : ALTER TABLE _caftanrh_migrations ENABLE ROW LEVEL SECURITY;");
  console.log("Relance avec --apply pour appliquer.");
  await c.end();
  process.exit(0);
}

await c.query(`alter table _caftanrh_migrations enable row level security`);
await c.query(
  `comment on table _caftanrh_migrations is
   'Table interne de tracking des migrations. RLS activee 2026-05-13 (Supabase advisor) ; aucune policy => inaccessible via PostgREST/anon. Seul le script scripts/run-migrations.mjs (pg direct) peut la lire/ecrire.'`,
);

const { rows: post } = await c.query(`
  select relrowsecurity from pg_class
  where relname = '_caftanrh_migrations' and relnamespace = (select oid from pg_namespace where nspname='public')
`);
console.log(`\n✅ RLS active. relrowsecurity = ${post[0]?.relrowsecurity}`);

await c.end();
