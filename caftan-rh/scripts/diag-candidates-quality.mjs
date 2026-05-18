// Karim 18/05 : diagnostic complet "qualite candidats" pour preparer
// (1) vraie date d inscription, (2) dedupe, (3) classification.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log("\n=== 1. DATES (raw_payload.date_created vs applied_at) ===");
const { rows: dateRows } = await c.query(`
  select c.full_name, c.applied_at, c.raw_payload->>'date_created' as gf_date,
    c.created_at as db_created
  from candidates c
  where c.source = 'gravity_forms'
  order by c.created_at desc limit 5
`);
for (const r of dateRows) {
  console.log(`  ${r.full_name}`);
  console.log(`    applied_at (UI)  : ${r.applied_at}`);
  console.log(`    GF date_created  : ${r.gf_date}`);
  console.log(`    DB created_at    : ${r.db_created.toISOString()}`);
}

console.log("\n=== 2. DOUBLONS ===");
const { rows: byEmail } = await c.query(`
  select count(*)::int as n from (
    select lower(email) as e, count(*) as cnt from candidates
    where email is not null group by lower(email) having count(*) > 1
  ) sub
`);
const { rows: byPhone } = await c.query(`
  select count(*)::int as n from (
    select phone, count(*) as cnt from candidates
    where phone is not null and phone <> '' group by phone having count(*) > 1
  ) sub
`);
const { rows: byEmailJob } = await c.query(`
  select count(*)::int as n from (
    select lower(c.email) as e, a.job_id, count(*) as cnt
    from candidates c join applications a on a.candidate_id = c.id
    where c.email is not null
    group by lower(c.email), a.job_id having count(*) > 1
  ) sub
`);
console.log(`  Doublons par email          : ${byEmail[0].n} groupes`);
console.log(`  Doublons par telephone      : ${byPhone[0].n} groupes`);
console.log(`  Doublons (email + job)      : ${byEmailJob[0].n} groupes`);

console.log("\n=== 3. CHAMPS DE QUALITE ===");
const { rows: quality } = await c.query(`
  select
    count(*) filter (where email is not null) as has_email,
    count(*) filter (where phone is not null and phone <> '') as has_phone,
    count(*) filter (where city is not null and city <> '') as has_city,
    count(*) filter (where birth_date is not null) as has_birth,
    count(*) filter (where langs is not null) as has_langs,
    count(*) filter (where distance_km is not null) as has_distance,
    count(*) filter (where wanted_contract_type is not null) as has_contract,
    count(*) filter (where cv_url is not null) as has_cv,
    count(*) as total
  from candidates
`);
const q = quality[0];
const pct = (n) => `${Math.round(100 * n / q.total)}%`;
console.log(`  Total candidats : ${q.total}`);
console.log(`  Email           : ${q.has_email} (${pct(q.has_email)})`);
console.log(`  Telephone       : ${q.has_phone} (${pct(q.has_phone)})`);
console.log(`  Ville           : ${q.has_city} (${pct(q.has_city)})`);
console.log(`  Date naiss.     : ${q.has_birth} (${pct(q.has_birth)})`);
console.log(`  Langues         : ${q.has_langs} (${pct(q.has_langs)})`);
console.log(`  Distance        : ${q.has_distance} (${pct(q.has_distance)})`);
console.log(`  Contrat souhait : ${q.has_contract} (${pct(q.has_contract)})`);
console.log(`  CV uploade      : ${q.has_cv} (${pct(q.has_cv)})`);

console.log("\n=== 4. POSTES OUVERTS ===");
const { rows: jobs } = await c.query(`
  select j.title, j.location, j.contract_type, count(a.id)::int as nb_apps
  from jobs j left join applications a on a.job_id = j.id
  where j.is_open = true
  group by j.id, j.title, j.location, j.contract_type
  order by nb_apps desc
`);
for (const j of jobs) {
  console.log(`  [${j.contract_type ?? "?"}] ${j.title} (${j.location ?? "?"}) -> ${j.nb_apps} candidatures`);
}

await c.end();
