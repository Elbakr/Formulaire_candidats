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
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_name = 'auto_plan_drafts'
  order by ordinal_position
`);
console.log("=== Schema auto_plan_drafts ===");
for (const r of rows) {
  console.log(`  ${r.column_name.padEnd(30)} | ${r.data_type.padEnd(25)} | ${r.is_nullable === "NO" ? "NOT NULL" : "nullable"} | default=${r.column_default ?? "—"}`);
}

await c.end();
