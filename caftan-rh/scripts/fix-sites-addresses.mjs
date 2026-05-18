// Karim 18/05 : adresses exactes des sites Caftan + ajustement coords.
//   A : 230 rue de Brabant, 1030 Schaerbeek
//   D : 224 rue de Brabant, 1030 Schaerbeek
//   E : 93  rue de Brabant, 1030 Schaerbeek  (NOT Molenbeek comme en base !)
//   B : 118 chaussee de Gand, 1080 Molenbeek-Saint-Jean
//
// Coordonnees OpenStreetMap Nominatim (verifiees) :
//   - 230 rue de Brabant 1030 : ~50.8636 / 4.3628
//   - 224 rue de Brabant 1030 : ~50.8639 / 4.3626  (a 30m du 230)
//   - 93 rue de Brabant 1030  : ~50.8602 / 4.3628
//   - 118 chaussee de Gand 1080 : ~50.8576 / 4.3299

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const updates = [
  { code: "A", address: "230 rue de Brabant", postcode: "1030", city: "Schaerbeek", lat: 50.8636, lng: 4.3628 },
  { code: "D", address: "224 rue de Brabant", postcode: "1030", city: "Schaerbeek", lat: 50.8639, lng: 4.3626 },
  { code: "E", address: "93 rue de Brabant",  postcode: "1030", city: "Schaerbeek", lat: 50.8602, lng: 4.3628 },
  { code: "B", address: "118 chaussee de Gand", postcode: "1080", city: "Molenbeek-Saint-Jean", lat: 50.8576, lng: 4.3299 },
];

console.log(`\n=== Fix sites addresses (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);
for (const u of updates) {
  const { rows: before } = await c.query(`select code, address, city, lat, lng from sites where code = $1`, [u.code]);
  if (before.length === 0) {
    console.log(`[SKIP] Site ${u.code} introuvable.`);
    continue;
  }
  const b = before[0];
  console.log(`[${u.code}] ${b.address ?? "(vide)"} / ${b.city ?? "?"} / ${b.lat ?? "?"}, ${b.lng ?? "?"}`);
  console.log(`   ->  ${u.address} / ${u.city} / ${u.lat}, ${u.lng}`);
  if (APPLY) {
    await c.query(
      `update sites set address = $1, city = $2, lat = $3, lng = $4 where code = $5`,
      [u.address, u.city, u.lat, u.lng, u.code],
    );
  }
}

console.log(`\n${APPLY ? "✅ Applique." : "[DRY-RUN] Relance avec --apply."}\n`);
await c.end();
