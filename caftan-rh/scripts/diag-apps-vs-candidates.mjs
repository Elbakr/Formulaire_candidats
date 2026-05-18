// Karim 18/05 : verifier si les nouveaux candidats GF ont une APPLICATION
// associee. La page /rh/candidates liste applications, pas candidates.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: counts } = await c.query(`
  select
    (select count(*)::int from candidates) as candidates_total,
    (select count(*)::int from applications) as applications_total,
    (select count(*)::int from candidates where created_at >= '2026-05-09') as cand_since_9may,
    (select count(*)::int from applications where created_at >= '2026-05-09') as app_since_9may,
    (select count(*)::int from candidates where created_at >= '2026-05-09'
        and id not in (select candidate_id from applications)) as orphan_cand_since_9may
`);
console.log("Comptes :", counts[0]);

const { rows: orphans } = await c.query(`
  select c.id, c.full_name, c.email, c.created_at, c.source
  from candidates c
  where c.created_at >= '2026-05-09'
    and not exists (select 1 from applications a where a.candidate_id = c.id)
  order by c.created_at desc limit 15
`);
console.log(`\nCandidats post-9 mai SANS application (orphelins, ${orphans.length} listes) :`);
for (const r of orphans) {
  console.log(`  ${r.created_at.toISOString().slice(0, 16)} | ${r.source} | ${r.full_name} | ${r.email}`);
}

const { rows: latestApps } = await c.query(`
  select a.created_at, c.full_name, c.applied_at
  from applications a join candidates c on c.id = a.candidate_id
  order by a.created_at desc limit 5
`);
console.log(`\n5 dernieres applications (any date) :`);
for (const r of latestApps) {
  console.log(`  app.created_at=${r.created_at.toISOString().slice(0, 16)} | applied_at=${r.applied_at} | ${r.full_name}`);
}

await c.end();
