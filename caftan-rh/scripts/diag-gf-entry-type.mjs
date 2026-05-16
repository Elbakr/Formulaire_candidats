import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(`
  select column_name, data_type from information_schema.columns
  where table_name = 'candidates' and column_name = 'gf_entry_id'
`);
console.log("Type de candidates.gf_entry_id :", rows[0]);

const { rows: sample } = await c.query(`select gf_entry_id from candidates where gf_entry_id is not null limit 3`);
console.log("Sample values:", sample);

const { rows: dup } = await c.query(`
  select gf_entry_id, count(*)::int as n
  from candidates where gf_entry_id is not null
  group by gf_entry_id having count(*) > 1
  order by n desc limit 5
`);
console.log("Doublons gf_entry_id :", dup);

await c.end();
