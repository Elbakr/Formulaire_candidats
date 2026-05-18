import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: cols } = await c.query(`
  select column_name from information_schema.columns
  where table_name = 'sites' and column_name in ('id','code','name','lat','lng','address','postcode','city')
`);
console.log("Colonnes sites disponibles :", cols.map(c => c.column_name).join(", "));

const { rows: sites } = await c.query(`select id, code, name, lat, lng from sites where is_active = true order by sort_order`);
console.log("\nSites actifs :");
for (const s of sites) {
  console.log(`  ${s.code.padEnd(3)} | ${s.name.padEnd(30)} | lat=${s.lat ?? "?"} lng=${s.lng ?? "?"}`);
}

const { rows: cands } = await c.query(`
  select count(*) filter (where distance_km is not null) as has_dist,
         count(*) as total from candidates
`);
console.log(`\nCandidats avec distance_km : ${cands[0].has_dist}/${cands[0].total}`);

const { rows: bePostcode } = await c.query(`
  select count(*)::int as n from information_schema.tables where table_name = 'be_postcodes'
`);
console.log(`Table be_postcodes existe : ${bePostcode[0].n > 0 ? "OUI" : "NON"}`);
if (bePostcode[0].n > 0) {
  const { rows: pc } = await c.query(`select count(*)::int as n from be_postcodes`);
  console.log(`  ${pc[0].n} codes postaux en base.`);
}

await c.end();
