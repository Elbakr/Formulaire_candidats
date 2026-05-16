// Karim 16/05 (confirmation explicite "oui") : vide la semaine 25-31 mai
// pour permettre une re-generation propre avec les derniers fix
// (boost +1 par besoin, batch awareness multi-sites, MAX au lieu de PRODUCT).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: before } = await c.query(`
  select count(*)::int as n from shifts where date >= '2026-05-25' and date <= '2026-05-31'
`);
console.log(`\nShifts en base avant : ${before[0].n}`);

if (APPLY) {
  const { rowCount } = await c.query(`
    delete from shifts where date >= '2026-05-25' and date <= '2026-05-31'
  `);
  console.log(`✅ ${rowCount} shifts supprimes.`);
  const { rowCount: dr } = await c.query(`
    update auto_plan_drafts
    set rolled_back_at = now()
    where week_monday = '2026-05-25'
      and status = 'approved'
      and rolled_back_at is null
  `);
  console.log(`✅ ${dr} auto_plan_drafts marques rolled_back.`);
} else {
  console.log(`[DRY-RUN] Relance avec --apply pour supprimer.`);
}

await c.end();
