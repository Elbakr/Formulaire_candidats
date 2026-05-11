// Ajoute site_needs.is_enabled BOOLEAN DEFAULT true.
// Le RH peut eteindre un creneau ponctuellement (sans le supprimer) : le
// solver l'ignore tant que is_enabled=false, et il reste visible/grise dans
// le besoins-editor pour pouvoir le rallumer ulterieurement.

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

console.log(`\n=== Migration site_needs.is_enabled (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

const { rows } = await c.query(
  `select 1 from information_schema.columns
   where table_name='site_needs' and column_name='is_enabled'`,
);
if (rows.length > 0) {
  console.log("Colonne is_enabled deja presente ✓");
} else {
  console.log("Ajout de site_needs.is_enabled BOOLEAN NOT NULL DEFAULT true");
  if (APPLY) {
    await c.query(`alter table site_needs add column is_enabled boolean not null default true`);
    await c.query(
      `comment on column site_needs.is_enabled is
       'false = creneau eteint, le solver l''ignore. Reste visible et grise dans le besoins-editor pour pouvoir le rallumer. Defaut true.'`,
    );
  }
}

console.log(`\n${APPLY ? "✅" : "[DRY-RUN]"}`);
await c.end();
