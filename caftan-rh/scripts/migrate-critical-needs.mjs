// Migration idempotente :
//  1. Ajoute la colonne site_needs.is_critical (smallint, 0|1|2)
//      0 = normal · 1 = critique · 2 = ultra-critique (priorite absolue)
//  2. Met à jour l'adresse du site E
//  3. Insère pour chaque site x chaque jour de la semaine 2 site_needs critiques :
//      - 14:30-17:30 headcount=1 is_critical=2 (ultra-critique)
//      - 12:30-18:30 headcount=1 is_critical=1 (critique)
//  Les besoins existants restent intacts (chevauchement autorisé).
//
// Dry-run par défaut. Pass --apply pour exécuter.

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

console.log(`\n=== Migration "creneaux critiques" (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

// --- 1. Colonne is_critical -------------------------------------------------
const { rows: colCheck } = await c.query(
  `select 1 from information_schema.columns
   where table_name='site_needs' and column_name='is_critical'`,
);
const hasColumn = colCheck.length > 0;
if (!hasColumn) {
  console.log("[1] Ajout de la colonne site_needs.is_critical SMALLINT DEFAULT 0");
  if (APPLY) {
    await c.query(
      `alter table site_needs add column is_critical smallint not null default 0`,
    );
    await c.query(
      `comment on column site_needs.is_critical is
       '0=normal, 1=critique, 2=ultra-critique (priorite absolue solver). Indispensable, couvre meme les jours feries.'`,
    );
  }
} else {
  console.log("[1] Colonne is_critical : déjà présente ✓");
}

// --- 2. Adresse site E ------------------------------------------------------
const { rows: siteE } = await c.query(
  `select id, code, name, address from sites where code='E'`,
);
if (siteE[0]) {
  const target = "Chaussée de Gand, 1080 Molenbeek-Saint-Jean";
  if (siteE[0].address !== target) {
    console.log(`[2] Site E adresse : '${siteE[0].address}' -> '${target}'`);
    if (APPLY) {
      await c.query(`update sites set address=$1 where id=$2`, [target, siteE[0].id]);
    }
  } else {
    console.log("[2] Site E adresse : déjà à jour ✓");
  }
} else {
  console.log("[2] Site E introuvable. Skip.");
}

// --- 3. Créneaux critiques pour chaque site ---------------------------------
const { rows: sites } = await c.query(
  `select id, code, name from sites where is_active = true order by code`,
);
console.log(`\n[3] Insertion creneaux critiques sur ${sites.length} sites :`);

const critical = [
  { start: "14:30", end: "17:30", crit: 2, label: "ultra-critique" },
  { start: "12:30", end: "18:30", crit: 1, label: "critique" },
];
const days = [
  { dow: 0, label: "Dim" },
  { dow: 1, label: "Lun" },
  { dow: 2, label: "Mar" },
  { dow: 3, label: "Mer" },
  { dow: 4, label: "Jeu" },
  { dow: 5, label: "Ven" },
  { dow: 6, label: "Sam" },
];

let inserted = 0;
let skipped = 0;
for (const site of sites) {
  for (const c2 of critical) {
    for (const d of days) {
      const selectCol = (hasColumn || APPLY) ? "is_critical" : "0 as is_critical";
      const { rows: existing } = await c.query(
        `select id, ${selectCol} from site_needs
         where site_id=$1 and day_of_week=$2 and start_time=$3 and end_time=$4
           and (role is null or role = 'Vendeur(se)')`,
        [site.id, d.dow, c2.start + ":00", c2.end + ":00"],
      );
      if (existing.length > 0) {
        const cur = Number(existing[0].is_critical);
        if (cur === c2.crit) {
          skipped++;
        } else {
          if (APPLY) {
            await c.query(
              `update site_needs set is_critical=$1 where id=$2`,
              [c2.crit, existing[0].id],
            );
          }
          console.log(`  ${site.code} ${d.label} ${c2.start}-${c2.end} : update is_critical ${cur}->${c2.crit}`);
        }
      } else {
        inserted++;
        if (APPLY) {
          await c.query(
            `insert into site_needs (site_id, day_of_week, start_time, end_time, headcount, role, is_critical)
             values ($1,$2,$3,$4,$5,$6,$7)`,
            [site.id, d.dow, c2.start + ":00", c2.end + ":00", 1, "Vendeur(se)", c2.crit],
          );
        }
      }
    }
  }
}

console.log(`\n[3] Synthese : ${inserted} a inserer, ${skipped} deja conformes`);
console.log(`\n${APPLY ? "✅ Migration appliquée." : "[DRY-RUN] Relance avec --apply."}\n`);

await c.end();
