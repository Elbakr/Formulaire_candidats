// Karim 16/05 : verifier que le sync Gravity Forms est correctement configure.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(`
  select wp_url, ck, cs, form_id, enabled, last_synced_at, last_sync_count
  from gf_settings where id = 1
`);
if (rows.length === 0) {
  console.log("Aucune ligne gf_settings — table vide ou non initialisee.");
} else {
  const r = rows[0];
  console.log(`gf_settings :`);
  console.log(`  wp_url           = ${r.wp_url ?? "(null)"}`);
  console.log(`  ck (clef)        = ${r.ck ? "[present " + r.ck.slice(0, 8) + "...]" : "(null)"}`);
  console.log(`  cs (secret)      = ${r.cs ? "[present]" : "(null)"}`);
  console.log(`  form_id          = ${r.form_id}`);
  console.log(`  enabled          = ${r.enabled}`);
  console.log(`  last_synced_at   = ${r.last_synced_at ?? "(jamais)"}`);
  console.log(`  last_sync_count  = ${r.last_sync_count ?? "(null)"}`);
}

const { rows: cnt } = await c.query(`select count(*)::int as n from candidates`);
console.log(`\nTotal candidates en base : ${cnt[0].n}`);

const { rows: latest } = await c.query(`
  select full_name, email, source, created_at
  from candidates order by created_at desc limit 5
`);
console.log(`\n5 derniers candidats :`);
for (const r of latest) {
  console.log(`  ${r.created_at.toISOString().slice(0, 16)} | ${(r.source ?? "—").padEnd(15)} | ${r.full_name} | ${r.email ?? "(no email)"}`);
}

console.log(`\nCRON_SECRET defini : ${process.env.CRON_SECRET ? "OUI" : "NON"}`);
await c.end();
