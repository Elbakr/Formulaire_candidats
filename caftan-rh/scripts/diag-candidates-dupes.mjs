// Karim 16/05 : liste les doublons dans candidates par (email, full_name).
// Lecture seule -- ne deduplique PAS automatiquement.
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

console.log(`\n=== Doublons par EMAIL (case-insensitive, ignore null) ===\n`);
const byEmail = await c.query(`
  select lower(email) as email_key, count(*) as n,
         array_agg(id::text order by created_at) as ids,
         array_agg(full_name order by created_at) as names,
         array_agg(coalesce(source,'(none)') order by created_at) as sources,
         array_agg(to_char(created_at,'YYYY-MM-DD HH24:MI') order by created_at) as dates
  from candidates
  where email is not null and email <> ''
  group by lower(email)
  having count(*) > 1
  order by n desc, email_key
  limit 50
`);
if (byEmail.rows.length === 0) {
  console.log("  (aucun doublon par email)");
} else {
  for (const r of byEmail.rows) {
    console.log(`  [x${r.n}] ${r.email_key}`);
    for (let i = 0; i < r.ids.length; i++) {
      console.log(`        ${r.ids[i]} | ${r.dates[i]} | ${r.sources[i].padEnd(12)} | ${r.names[i]}`);
    }
  }
}

console.log(`\n=== Doublons par FULL_NAME (case+space normalise) ===\n`);
const byName = await c.query(`
  with norm as (
    select id, full_name, email, source, created_at,
           regexp_replace(lower(trim(full_name)), '\\s+', ' ', 'g') as key
    from candidates
    where full_name is not null and full_name <> ''
  )
  select key, count(*) as n,
         array_agg(id::text order by created_at) as ids,
         array_agg(full_name order by created_at) as names,
         array_agg(coalesce(email,'(no email)') order by created_at) as emails,
         array_agg(coalesce(source,'(none)') order by created_at) as sources,
         array_agg(to_char(created_at,'YYYY-MM-DD HH24:MI') order by created_at) as dates
  from norm
  group by key
  having count(*) > 1
  order by n desc, key
  limit 50
`);
if (byName.rows.length === 0) {
  console.log("  (aucun doublon par nom)");
} else {
  for (const r of byName.rows) {
    console.log(`  [x${r.n}] ${r.names[0]}`);
    for (let i = 0; i < r.ids.length; i++) {
      console.log(`        ${r.ids[i]} | ${r.dates[i]} | ${r.sources[i].padEnd(12)} | ${r.emails[i]}`);
    }
  }
}

console.log(`\n=== Stats ===`);
const stats = await c.query(`
  select
    (select count(*)::int from candidates) as total,
    (select count(*)::int from (select 1 from candidates where email is not null and email <> '' group by lower(email) having count(*) > 1) t) as dupe_email_groups,
    (select count(*)::int from (
      select 1 from candidates
      where full_name is not null and full_name <> ''
      group by regexp_replace(lower(trim(full_name)), '\\s+', ' ', 'g')
      having count(*) > 1
    ) t) as dupe_name_groups
`);
console.log(`  total candidates       : ${stats.rows[0].total}`);
console.log(`  groupes doublons email : ${stats.rows[0].dupe_email_groups}`);
console.log(`  groupes doublons nom   : ${stats.rows[0].dupe_name_groups}`);

await c.end();
