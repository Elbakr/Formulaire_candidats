import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(`
  select st.code, sn.day_of_week, sn.start_time, sn.end_time, sn.headcount, sn.is_critical, sn.role, sn.is_enabled
  from site_needs sn
  join sites st on st.id = sn.site_id
  where sn.is_enabled = true and sn.day_of_week = 1
  order by st.code, sn.start_time
`);

console.log(`\nSite_needs LUNDI (dow=1) :\n`);
let prev = "";
let total = 0;
let totalPerSite = new Map();
for (const r of rows) {
  if (r.code !== prev) {
    console.log(`\nSite ${r.code} :`);
    prev = r.code;
  }
  console.log(`  ${r.start_time.slice(0,5)} - ${r.end_time.slice(0,5)} | headcount=${r.headcount} | role=${r.role ?? "—"} | critical=${r.is_critical ?? 0}`);
  total += r.headcount;
  totalPerSite.set(r.code, (totalPerSite.get(r.code) ?? 0) + r.headcount);
}
console.log(`\nTotal headcount cumule LUNDI (tous slots, tous sites) : ${total}`);
console.log(`Par site :`);
for (const [code, n] of totalPerSite) console.log(`  ${code} = ${n}`);

await c.end();
