// Audit RLS : liste toutes les tables public sans RLS active OU sans policies.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// Toutes les tables public avec leur etat RLS
const { rows: tables } = await c.query(`
  select c.relname as table_name,
         c.relrowsecurity as rls_enabled,
         (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policy_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='r'
  order by c.relrowsecurity asc, c.relname
`);

console.log("=== Audit RLS ===\n");
const noRls = tables.filter((t) => !t.rls_enabled);
const noPolicy = tables.filter((t) => t.rls_enabled && Number(t.policy_count) === 0);

console.log(`🔴 Tables SANS RLS active (${noRls.length}) -- CRITIQUE :`);
for (const t of noRls) console.log(`  ${t.table_name}`);

console.log(`\n🟡 Tables avec RLS mais ZERO policy (${noPolicy.length}) -- inaccessibles :`);
for (const t of noPolicy) console.log(`  ${t.table_name}`);

console.log(`\n🟢 Tables OK : ${tables.length - noRls.length - noPolicy.length}`);

await c.end();
