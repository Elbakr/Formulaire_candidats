// Karim 19/05 : pour les candidats GF deja en base SANS cv_url ni gf_full_payload,
// on re-fetch leur entry GF par id (gf_entry_id) et on update les 2 champs.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: settings } = await c.query(`select wp_url, ck, cs, form_id, field_map from gf_settings where id=1`);
const s = settings[0];
const auth = "Basic " + Buffer.from(`${s.ck}:${s.cs}`).toString("base64");
const fm = s.field_map;

const CV_FALLBACK_KEYS = ["7", "9", "15", "16", "17", "18", "cv", "cv_url", "cv_link", "CV"];
function findCv(entry) {
  for (const k of CV_FALLBACK_KEYS) {
    const v = entry[k];
    if (typeof v === "string" && /^https?:/i.test(v) && v.length > 10) return v;
  }
  return null;
}

// Candidats sans gf_full_payload OU sans cv_url
const { rows: cands } = await c.query(`
  select id, full_name, gf_entry_id, cv_url
  from candidates
  where source='gravity_forms' and gf_entry_id is not null
    and (gf_full_payload is null or gf_full_payload = '{}'::jsonb or cv_url is null)
  order by applied_at desc nulls last
`);
console.log(`\n${cands.length} candidats a re-fetcher.\n`);

let withCv = 0, withoutCv = 0, errors = 0;

for (const cand of cands) {
  const url = `${s.wp_url.replace(/\/$/, "")}/wp-json/gf/v2/entries/${cand.gf_entry_id}`;
  let entry;
  try {
    const r = await fetch(url, { headers: { Authorization: auth } });
    if (!r.ok) { errors++; continue; }
    entry = await r.json();
  } catch { errors++; continue; }

  const cv = findCv(entry);
  await c.query(`
    update candidates
    set gf_full_payload = $1::jsonb,
        cv_url = coalesce(cv_url, $2)
    where id = $3
  `, [JSON.stringify(entry), cv, cand.id]);

  // Si CV trouve et pas de document, cree une row documents
  if (cv) {
    const { rows: existingDocs } = await c.query(
      `select id from documents where candidate_id=$1 and kind='cv' limit 1`,
      [cand.id],
    );
    if (existingDocs.length === 0) {
      await c.query(`
        insert into documents (candidate_id, kind, catalog_slug, storage_path, file_name, mime_type, validation_status)
        values ($1, 'cv', 'cv', $2, $3, 'application/pdf', 'pending')
      `, [cand.id, cv, `CV - ${cand.full_name}.pdf`]);
    }
    withCv++;
    console.log(`  ✓ ${cand.full_name.padEnd(28)} CV : ${cv.slice(0, 80)}`);
  } else {
    withoutCv++;
    console.log(`  ⚠ ${cand.full_name.padEnd(28)} pas de CV dans GF (formulaire sans upload)`);
  }
}
console.log(`\nResume : ${withCv} CV recuperes, ${withoutCv} sans CV cote GF, ${errors} erreurs.`);
await c.end();
