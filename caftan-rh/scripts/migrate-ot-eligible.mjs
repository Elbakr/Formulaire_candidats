// Migration idempotente : ajoute employees.ot_eligible BOOLEAN.
// Par defaut FALSE : seul l'admin/RH bascule a TRUE pour les employes
// "meritants" qui ont demontre disponibilite et autonomie (decision Karim
// 2026-05-11). Le sélecteur d'OT case-par-case ne propose que les eligibles.

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

console.log(`\n=== Migration ot_eligible (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

const { rows: colCheck } = await c.query(
  `select 1 from information_schema.columns
   where table_name='employees' and column_name='ot_eligible'`,
);
if (colCheck.length === 0) {
  console.log("[1] Ajout de employees.ot_eligible BOOLEAN DEFAULT false");
  if (APPLY) {
    await c.query(
      `alter table employees add column ot_eligible boolean not null default false`,
    );
    await c.query(
      `comment on column employees.ot_eligible is
       'Eligible aux heures supplementaires sur invitation (proposeOvertimeCandidatesAction). RH bascule a true pour les employes ayant demontre disponibilite, autonomie, volontariat (decision Karim 2026-05-11).'`,
    );
  }
} else {
  console.log("[1] Colonne ot_eligible deja presente ✓");
}

console.log(`\n${APPLY ? "✅ Migration appliquee." : "[DRY-RUN] Relance avec --apply."}\n`);
await c.end();
