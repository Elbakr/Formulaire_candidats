// Diagnostic Karim 15/05 : lundi 25 mai 2026 ET son lendemain non planifies.
// Hypothese : entree(s) holidays.shops_closed=true en collision avec Pentecote
// ou Aid al-Adha autour de ces dates. On regarde TOUT entre 20 mai et 31 mai.
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

const { rows } = await c.query(`
  select id, date::text as date_text, label, kind, is_active, shops_closed, staff_multiplier, priority
  from holidays
  where date >= '2026-05-20' and date <= '2026-05-31'
  order by date, id
`);

console.log(`\nHolidays 20-31 mai 2026 :\n`);
for (const r of rows) {
  const d = r.date_text;
  const flag = r.shops_closed ? "🚫 FERME" : "✅ OUVERT";
  console.log(
    `  ${d} | ${r.label.padEnd(30)} | kind=${(r.kind ?? "—").padEnd(10)} | ${flag} | staff_mult=${r.staff_multiplier ?? "—"} | active=${r.is_active}`,
  );
}

console.log(`\nDates marquees shops_closed=true (bloquees par le solver) :`);
const blocked = rows.filter((r) => r.shops_closed === true);
for (const r of blocked) {
  console.log(`  → ${r.date_text} (${r.label})`);
}
if (blocked.length === 0) {
  console.log(`  (aucune)`);
}

await c.end();
