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

const r = await c.query(`
  select
    count(*) as total,
    count(*) filter (where gf_entry_id is not null) as from_gf,
    count(*) filter (where cv_url is not null) as with_cv,
    count(*) filter (where gf_full_payload is not null) as with_payload,
    count(*) filter (where raw_payload is not null) as with_raw_payload
  from candidates
`);
console.log("Candidate coverage:", r.rows[0]);

await c.end();
