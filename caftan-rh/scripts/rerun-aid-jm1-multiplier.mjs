// Decision Karim 2026-05-11 v4 : J-1 Aid + TOUT autre ferie (legal BE,
// international, religieux) -> staff_multiplier=2.0. Sinon 1.5.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows: jm1 } = await c.query(
  `select id, date::text as date_text, label, staff_multiplier
   from holidays
   where (label ilike '%fitr%' or label ilike '%adha%') and label ilike '%j-1%' and is_active=true`,
);
console.log(`J-1 Aid trouves : ${jm1.length}`);

for (const j of jm1) {
  const { rows: coincide } = await c.query(
    `select label, kind from holidays
     where date::text = $1 and id != $2 and is_active=true`,
    [j.date_text, j.id],
  );
  const mult = coincide.length > 0 ? 2.0 : 1.5;
  const cur = Number(j.staff_multiplier);
  if (cur !== mult) {
    console.log(`  ${j.date_text} | ${j.label} | x${cur} -> x${mult}${coincide.length > 0 ? ` (coincide: ${coincide.map((x)=>x.label).join(", ")})` : ""}`);
    if (APPLY) {
      await c.query(`update holidays set staff_multiplier=$1 where id=$2`, [mult, j.id]);
    }
  } else {
    console.log(`  ${j.date_text} | ${j.label} | x${cur} OK`);
  }
}

console.log(`\n${APPLY ? "✅" : "[DRY-RUN]"}`);
await c.end();
