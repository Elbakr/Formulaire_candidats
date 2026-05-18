import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// Inspecte le gf_full_payload des 3 derniers candidats GF pour identifier
// les keys "adresse / postcode / ville"
const { rows } = await c.query(`
  select full_name, city, gf_full_payload, raw_payload
  from candidates where source = 'gravity_forms' and gf_full_payload is not null
  order by applied_at desc limit 3
`);

for (const r of rows) {
  console.log(`\n--- ${r.full_name} ---`);
  console.log(`  candidates.city = "${r.city}"`);
  const full = r.gf_full_payload ?? {};
  const interesting = {};
  for (const [k, v] of Object.entries(full)) {
    if (typeof v !== "string" && typeof v !== "number") continue;
    const sv = String(v);
    if (sv.length < 2 || sv.length > 100) continue;
    if (/\d{4}/.test(sv) || /rue|street|chaussee|chauss|avenue|boulevard|adresse|address|ville|city|postcode|code postal|code_postal/i.test(k) || /rue|chaussee|avenue|boulevard/i.test(sv)) {
      interesting[k] = sv;
    }
  }
  console.log(`  champs potentiels adresse :`);
  for (const [k, v] of Object.entries(interesting)) {
    console.log(`    "${k}" : "${v}"`);
  }
}
await c.end();
