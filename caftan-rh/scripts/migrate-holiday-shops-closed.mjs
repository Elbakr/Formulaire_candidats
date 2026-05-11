// Migration idempotente :
//  1. Ajoute holidays.shops_closed BOOLEAN DEFAULT false.
//     Avant : kind='legal' fermait les magasins automatiquement (Ascension,
//     Toussaint, Noel...) -> le solver sautait la date. Probleme : la boutique
//     Caftan reste OUVERTE le 14 mai (Ascension), pre-Aid, soldes etc.
//     Apres : c'est l'admin qui decide explicitement quels jours sont fermes.
//     Par defaut TOUS les feries restent ouverts.
//  2. Corrige la date d'Ascension 2026 : 2026-05-13 -> 2026-05-14 (toujours jeudi).
//  3. Backfill : aucun ferie marque shops_closed=true par defaut. Si Karim veut
//     fermer Noel/Nouvel An, il le fait via /admin/holidays.

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

console.log(`\n=== Migration holidays.shops_closed + fix dates (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

// --- 1. Colonne shops_closed -----------------------------------------------
const { rows: colCheck } = await c.query(
  `select 1 from information_schema.columns
   where table_name='holidays' and column_name='shops_closed'`,
);
if (colCheck.length === 0) {
  console.log("[1] Ajout holidays.shops_closed BOOLEAN DEFAULT false");
  if (APPLY) {
    await c.query(
      `alter table holidays add column shops_closed boolean not null default false`,
    );
    await c.query(
      `comment on column holidays.shops_closed is
       'true = magasins fermes ce jour-la (solver saute la date). false (defaut) = ferie reconnu mais boutique ouverte (force-assignation activee : fixed_off ignore).'`,
    );
  }
} else {
  console.log("[1] Colonne shops_closed deja presente ✓");
}

// --- 2. Corrige dates Ascension --------------------------------------------
// Ascension 2026 : Paques = 2026-04-05 (dimanche) + 39 jours = jeudi 14 mai.
// Pareil Pentecote = Paques + 49 jours = dimanche 24 mai. Lundi de Pentecote
// = 25 mai. Verifions ce qui est en DB et corrigeons si necessaire.
const fixes = [
  { wrong: "2026-05-13", right: "2026-05-14", label: "Ascension" },
];
for (const f of fixes) {
  const { rows } = await c.query(
    `select id, date, label from holidays where date = $1 and label ilike $2`,
    [f.wrong, `%${f.label}%`],
  );
  if (rows.length === 0) {
    console.log(`[2] ${f.label} : date ${f.wrong} non trouvee (peut-etre deja corrigee)`);
    continue;
  }
  console.log(`[2] ${f.label} : ${f.wrong} -> ${f.right}`);
  if (APPLY) {
    // Verifie qu'il n'y a pas deja une entree a la date cible (eviter doublon UNIQUE)
    const { rows: existing } = await c.query(
      `select id from holidays where date = $1 and label = $2`,
      [f.right, rows[0].label],
    );
    if (existing.length > 0) {
      console.log(`  -> existe deja a ${f.right}, suppression de l'erreur ${f.wrong}`);
      await c.query(`delete from holidays where id = $1`, [rows[0].id]);
    } else {
      await c.query(`update holidays set date = $1 where id = $2`, [f.right, rows[0].id]);
    }
  }
}

// --- 3. Affichage etat final feries proches --------------------------------
const { rows: feries } = await c.query(
  `select date, label, kind, ${colCheck.length > 0 || APPLY ? "shops_closed" : "false as shops_closed"}
   from holidays
   where is_active = true and date >= current_date and date <= current_date + 60
   order by date`,
);
console.log(`\n[3] Feries des 60 prochains jours :`);
for (const f of feries) {
  const d = f.date instanceof Date ? f.date.toISOString().slice(0, 10) : f.date;
  console.log(`  ${d} | ${f.label.padEnd(35)} | ${f.kind.padEnd(13)} | shops_closed=${f.shops_closed}`);
}

console.log(`\n${APPLY ? "✅ Migration appliquee." : "[DRY-RUN] Relance avec --apply."}\n`);
await c.end();
