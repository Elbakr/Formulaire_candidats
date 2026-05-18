// Karim 18/05 : calcule distance_km du candidat vers le SITE Caftan le
// plus proche, depuis postal_code (champ 14 du nouveau formulaire GF).
//
//   1. Charge sites + coords (lat/lng).
//   2. Pour chaque candidate avec postal_code non null : lookup be_postcodes
//      -> obtenir coords du candidat -> haversine vers chaque site -> min.
//   3. Persiste candidates.distance_km.
//
// Les candidats sans postal_code (1435 anciens) restent NULL : le scoring
// fallback sur city (imprecise).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const EARTH_RADIUS_KM = 6371;
function haversineKm(a, b) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Charge sites
const { rows: sites } = await c.query(`select code, lat, lng from sites where is_active = true and lat is not null and lng is not null`);
console.log(`\n${sites.length} sites avec coordonnees.`);

// Candidats a traiter
const { rows: candidates } = await c.query(`
  select id, full_name, postal_code from candidates where postal_code is not null
`);
console.log(`${candidates.length} candidats avec postal_code.\n`);

if (candidates.length === 0) {
  console.log("Aucun candidat avec postal_code -> rien a calculer.");
  console.log("Karim : pour activer la distance precise, les candidats doivent");
  console.log("remplir le champ 14 (code postal) du formulaire Gravity Forms.");
  await c.end();
  process.exit(0);
}

let updated = 0, missingPc = 0;
for (const cand of candidates) {
  const { rows: pcRows } = await c.query(`select lat, lng from be_postcodes where postcode = $1`, [cand.postal_code]);
  if (pcRows.length === 0) { missingPc += 1; continue; }
  const pc = pcRows[0];
  let minKm = Infinity;
  let closestCode = null;
  for (const s of sites) {
    const km = haversineKm({ lat: Number(pc.lat), lng: Number(pc.lng) }, { lat: Number(s.lat), lng: Number(s.lng) });
    if (km < minKm) { minKm = km; closestCode = s.code; }
  }
  await c.query(`update candidates set distance_km = $1 where id = $2`, [Math.round(minKm), cand.id]);
  console.log(`  ${cand.full_name.padEnd(30)} | pc=${cand.postal_code} | -> Site ${closestCode} = ${minKm.toFixed(1)} km`);
  updated += 1;
}

console.log(`\n✅ ${updated} distances calculees. ${missingPc} postal_code introuvables dans be_postcodes.`);
await c.end();
