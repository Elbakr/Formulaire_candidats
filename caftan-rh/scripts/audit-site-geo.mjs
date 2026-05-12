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

// Schema sites
const { rows: cols } = await c.query(`
  select column_name, data_type from information_schema.columns
  where table_name = 'sites' order by ordinal_position
`);
console.log("Colonnes sites :");
for (const c2 of cols) console.log(`  ${c2.column_name} : ${c2.data_type}`);

// Donnees actuelles
const { rows: sites } = await c.query(`
  select id, code, name, address, ${cols.some((x) => x.column_name === "lat") ? "lat, lng," : ""} ${cols.some((x) => x.column_name === "geofence_radius_m") ? "geofence_radius_m" : "null as geofence_radius_m"}
  from sites order by code
`);
console.log(`\nSites (${sites.length}) :`);
for (const s of sites) console.log(`  ${s.code} | ${s.name} | addr=${s.address ?? "—"} | lat=${s.lat ?? "—"} lng=${s.lng ?? "—"} | rayon=${s.geofence_radius_m ?? "—"}m`);

await c.end();
