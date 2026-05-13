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

const { rows } = await c.query(`
  select conname, contype, pg_get_constraintdef(c.oid) as def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'auto_plan_drafts'
`);
console.log("=== Contraintes auto_plan_drafts ===");
for (const r of rows) console.log(`  ${r.conname.padEnd(40)} | ${r.contype} | ${r.def}`);

await c.end();
