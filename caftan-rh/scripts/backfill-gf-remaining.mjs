#!/usr/bin/env node
// Couvre les candidats GF non encore backfillés (gf_full_payload IS NULL)
// via une connexion Postgres directe (sans cap PostgREST 1000 rows).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const CV_KEYS = ["7", "9", "15", "16", "17", "18", "cv", "cv_url", "cv_link", "CV"];
function findCv(entry) {
  for (const k of CV_KEYS) {
    const v = entry[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v) && v.length > 10) return v;
  }
  return null;
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: settings } = await client.query("select wp_url, ck, cs, form_id from gf_settings where id = 1");
if (!settings[0]?.ck) { console.error("gf_settings incomplet"); process.exit(1); }
const cfg = settings[0];

console.log("→ Re-fetch GF (1809 entrées)…");
const auth = Buffer.from(`${cfg.ck}:${cfg.cs}`).toString("base64");
const all = [];
let page = 1;
while (true) {
  const url = `${cfg.wp_url.replace(/\/$/, "")}/wp-json/gf/v2/entries?form_ids[]=${cfg.form_id}&paging[page_size]=200&paging[current_page]=${page}`;
  const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  const j = await r.json();
  const entries = j.entries || [];
  all.push(...entries);
  if (entries.length < 200) break;
  page++;
  if (page > 50) break;
}
const byGfId = new Map(all.map(e => [String(e.id), e]));
console.log(`  ${all.length} entrées GF disponibles`);

console.log("→ Sélection des candidats à backfiller (gf_full_payload IS NULL)…");
const { rows: toFix } = await client.query(`
  select id, gf_entry_id, full_name
  from candidates
  where gf_entry_id is not null and gf_full_payload is null
`);
console.log(`  ${toFix.length} candidats à compléter`);

let updated = 0, cvsFound = 0, docsCreated = 0, docsSkipped = 0;

for (const cand of toFix) {
  const e = byGfId.get(cand.gf_entry_id);
  if (!e) continue;

  const cvUrl = findCv(e);
  if (cvUrl) cvsFound++;

  await client.query(
    "update candidates set cv_url = $1, gf_full_payload = $2 where id = $3",
    [cvUrl, e, cand.id],
  );
  updated++;

  if (cvUrl) {
    const { rows: existDocs } = await client.query(
      "select id from documents where candidate_id = $1 and kind = 'cv' limit 1",
      [cand.id],
    );
    if (existDocs.length === 0) {
      const { rows: appR } = await client.query(
        "select id from applications where candidate_id = $1 order by created_at desc limit 1",
        [cand.id],
      );
      const appId = appR[0]?.id ?? null;
      const filename = `CV - ${cand.full_name}.${cvUrl.split(".").pop()?.split("?")[0] || "pdf"}`;
      await client.query(
        `insert into documents (application_id, candidate_id, kind, catalog_slug, storage_path, file_name, mime_type, validation_status)
         values ($1, $2, 'cv', 'cv', $3, $4, $5, 'pending')`,
        [appId, cand.id, cvUrl, filename, cvUrl.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"],
      );
      docsCreated++;
    } else {
      docsSkipped++;
    }
  }

  if (updated % 100 === 0) console.log(`  ... ${updated}/${toFix.length}`);
}

await client.end();

console.log(`\nDone.`);
console.log(`  ${updated} candidats backfillés`);
console.log(`  ${cvsFound} CVs trouvés (${updated - cvsFound} sans CV)`);
console.log(`  ${docsCreated} documents créés (${docsSkipped} déjà existants)`);
