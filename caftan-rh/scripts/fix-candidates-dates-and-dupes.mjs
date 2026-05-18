// Karim 18/05 : 3 corrections sur candidates GF.
//
//   1. BACKFILL applied_at = raw_payload->>date_created
//      (les candidats syncs via cron API avaient applied_at = now()
//      au lieu de la vraie date GF -- bug lib/gravity-forms.ts ligne 241).
//
//   2. DEDUPE 288 groupes par email : garder le PLUS RECENT (decision
//      Karim 18/05), archiver les autres dans candidates_archive.
//      Critere "plus recent" = MAX(raw_payload->>date_created) ou
//      fallback created_at si pas de date_created.
//
//   3. PREVENTION : index unique partiel sur lower(email) where
//      source='gravity_forms' -> Postgres refuse desormais 2 candidats
//      gravity_forms avec le meme email.
//
// Usage : --apply pour executer, sinon DRY-RUN.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log(`\n=== Fix candidates (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

// --- 1. BACKFILL applied_at -------------------------------------------------
console.log("[1] Backfill applied_at depuis raw_payload->>date_created");
const { rows: needFix } = await c.query(`
  select count(*)::int as n from candidates
  where source = 'gravity_forms'
    and raw_payload->>'date_created' is not null
    and (applied_at is null
         or abs(extract(epoch from (applied_at - (raw_payload->>'date_created')::timestamptz))) > 60)
`);
console.log(`  ${needFix[0].n} candidats avec applied_at != date_created.`);
if (APPLY) {
  const { rowCount } = await c.query(`
    update candidates set applied_at = (raw_payload->>'date_created')::timestamptz
    where source = 'gravity_forms'
      and raw_payload->>'date_created' is not null
      and (applied_at is null
           or abs(extract(epoch from (applied_at - (raw_payload->>'date_created')::timestamptz))) > 60)
  `);
  console.log(`  ✓ ${rowCount} applied_at corriges.`);
}

// --- 2. ARCHIVE pour dedupe -------------------------------------------------
console.log("\n[2] Dedupe doublons par email (garder le plus recent)");

// Cree table archive si pas deja
if (APPLY) {
  await c.query(`
    create table if not exists candidates_archive (
      id uuid primary key,
      original_id uuid not null,
      kept_id uuid not null,
      data jsonb not null,
      archived_at timestamptz not null default now(),
      reason text not null default 'dedupe_by_email'
    )
  `);
}

// Identifie les doublons. Pour chaque groupe (lower(email)) :
//  - on calcule la "date effective" = COALESCE(applied_at, created_at)
//    car certains candidates ont applied_at NULL (sources autres que GF).
//  - on garde l id avec la date max ; les autres -> archive.
const { rows: dupGroups } = await c.query(`
  with groups as (
    select lower(email) as e,
      array_agg(id order by coalesce(applied_at, created_at) desc) as ids,
      array_agg(coalesce(applied_at, created_at) order by coalesce(applied_at, created_at) desc) as dates
    from candidates
    where email is not null
    group by lower(email)
    having count(*) > 1
  )
  select e, ids[1] as keep_id, ids[2:array_length(ids,1)] as discard_ids,
    array_length(ids,1) as cnt
  from groups
  order by cnt desc
`);
console.log(`  ${dupGroups.length} groupes a dedupliquer.`);
let totalDiscard = 0;
for (const g of dupGroups) totalDiscard += (g.discard_ids?.length ?? 0);
console.log(`  ${totalDiscard} candidats a archiver (garder ${dupGroups.length} les plus recents).`);

if (APPLY) {
  let archivedCount = 0;
  let deletedAppsCount = 0;
  for (const g of dupGroups) {
    const discardIds = g.discard_ids ?? [];
    if (discardIds.length === 0) continue;
    // Copie dans archive
    await c.query(`
      insert into candidates_archive (id, original_id, kept_id, data, reason)
      select gen_random_uuid(), c.id, $1, to_jsonb(c.*), 'dedupe_by_email_keep_latest'
      from candidates c where c.id = ANY($2::uuid[])
    `, [g.keep_id, discardIds]);
    // Delete applications associees (CASCADE recommandee mais on est explicite)
    const { rowCount: appsDel } = await c.query(`
      delete from applications where candidate_id = ANY($1::uuid[])
    `, [discardIds]);
    deletedAppsCount += appsDel ?? 0;
    // Delete les candidates
    const { rowCount: candDel } = await c.query(`
      delete from candidates where id = ANY($1::uuid[])
    `, [discardIds]);
    archivedCount += candDel ?? 0;
  }
  console.log(`  ✓ ${archivedCount} candidates archives + supprimes (${deletedAppsCount} applications associees nettoyees).`);
}

// --- 3. PREVENTION : index unique partiel sur (lower(email)) source=gravity_forms
console.log("\n[3] Index unique partiel pour empecher re-import de doublons");
if (APPLY) {
  try {
    await c.query(`
      create unique index if not exists uniq_candidates_gf_email
        on candidates (lower(email))
        where source = 'gravity_forms' and email is not null
    `);
    console.log(`  ✓ Index uniq_candidates_gf_email cree (ou deja present).`);
  } catch (e) {
    console.error(`  ✗ Erreur index : ${e.message}`);
    console.log(`  (Probable : doublons encore presents -> finis le DELETE d abord.)`);
  }
} else {
  console.log(`  [DRY-RUN] L index est cree uniquement en --apply.`);
}

console.log(`\n${APPLY ? "✅ Termine." : "[DRY-RUN] Relance avec --apply."}\n`);
await c.end();
