// Supprime le shift OT injustifié d'Hidaya (cbfa0ad8).
// Sa semaine du 4 mai n'avait que 12h contractuelles (cible 24h) -> l'OT
// n'aurait jamais dû être autorisée. Décision : suppression complète.

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

const shiftId = "cbfa0ad8";
const { rows: before } = await c.query(
  `select id, employee_id, date, start_time, end_time, is_overtime, overtime_multiplier, notes
   from shifts where id::text like $1 || '%'`,
  [shiftId],
);
console.log("AVANT :", before);

if (before.length !== 1) {
  console.error(`\n❌ Attendu 1 shift, trouvé ${before.length}. Abort.`);
  await c.end();
  process.exit(1);
}
if (!before[0].is_overtime) {
  console.error(`\n❌ Ce shift n'est pas OT, refus par sécurité.`);
  await c.end();
  process.exit(1);
}

if (!APPLY) {
  console.log("\n[DRY-RUN] Relance avec --apply pour supprimer.");
  await c.end();
  process.exit(0);
}

const { rowCount } = await c.query(
  `delete from shifts where id::text like $1 || '%' and is_overtime = true`,
  [shiftId],
);
console.log(`\n✅ ${rowCount} shift supprimé.`);

await c.end();
