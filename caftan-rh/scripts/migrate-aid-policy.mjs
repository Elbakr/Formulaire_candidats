// Politique Aid (Karim 2026-05-11 v2) :
//  - J     : magasin ferme (shops_closed=true)
//  - J+1   : magasin OUVERT (correction : etait true par erreur)
//  - J-1   : magasin OUVERT, gros rush pre-Aid, staff_multiplier=1.5
//  - J-1 coincide avec autre ferie international -> staff_multiplier=2.0
//
//  1. Ajoute holidays.staff_multiplier NUMERIC DEFAULT 1.0
//  2. Reset shops_closed sur les J+1 d'Aid -> false
//  3. Pour chaque Aid (J), cree une entree Aid -- j-1 si manquante,
//     shops_closed=false, priority=3, staff_multiplier=1.5 (ou 2.0 si
//     coincidence avec autre ferie international meme jour).

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

console.log(`\n=== Politique Aid (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

// --- 1. Colonne staff_multiplier ------------------------------------------
const { rows: colCheck } = await c.query(
  `select 1 from information_schema.columns
   where table_name='holidays' and column_name='staff_multiplier'`,
);
if (colCheck.length === 0) {
  console.log("[1] Ajout holidays.staff_multiplier NUMERIC(4,2) DEFAULT 1.0");
  if (APPLY) {
    await c.query(
      `alter table holidays add column staff_multiplier numeric(4,2) not null default 1.0`,
    );
    await c.query(
      `comment on column holidays.staff_multiplier is
       'Multiplicateur d''effectif applique sur les site_needs ce jour (rush pre-Aid, soldes, etc.). 1.0 = normal, 1.5 = rush significatif, 2.0 = rush ultra-eleve (ex: J-1 Aid coincide avec autre ferie international).'`,
    );
  }
} else {
  console.log("[1] Colonne staff_multiplier deja presente ✓");
}

// --- 2. Reset J+1 Aid : shops_closed=false --------------------------------
const { rows: jPlus1 } = await c.query(
  `select id, date::text as date_text, label, shops_closed
   from holidays
   where (label ilike '%j+1%' or label ilike '%-- j+1%' or label ilike '— j+1%')
     and (label ilike '%fitr%' or label ilike '%adha%')`,
);
console.log(`\n[2] J+1 Aid trouvees : ${jPlus1.length}`);
for (const r of jPlus1) {
  console.log(`  ${r.date_text} | ${r.label} | shops_closed actuel=${r.shops_closed}`);
}
if (APPLY && jPlus1.length > 0) {
  const ids = jPlus1.map((r) => r.id);
  await c.query(`update holidays set shops_closed=false where id = any($1::uuid[])`, [ids]);
  console.log(`  -> ${ids.length} mises a shops_closed=false`);
}

// --- 3. Cree les J-1 Aid manquants ---------------------------------------
// On cherche les "jour J" (label sans suffixe j+1).
const { rows: aidJ } = await c.query(
  `select id, date::text as date_text, label, kind, country, region, priority,
     recurring_yearly, tradition
   from holidays
   where (label ilike '%a%d al-fitr%' or label ilike '%a%d al-adha%')
     and label not ilike '%j+1%'
     and is_active = true
   order by date`,
);
console.log(`\n[3] Aid (jour J) trouves : ${aidJ.length}`);

let created = 0;
let updated = 0;
for (const aid of aidJ) {
  const aidDate = new Date(aid.date_text + "T12:00:00Z"); // midi UTC pour eviter DST
  const jMinus1 = new Date(aidDate.getTime() - 86_400_000);
  const jMinus1ISO = jMinus1.toISOString().slice(0, 10);

  // Coincidence avec TOUT autre ferie actif a la meme date J-1 ?
  // Decision Karim v4 : legal BE, international, religieux -- tout compte.
  const { rows: coincide } = await c.query(
    `select id, label, kind from holidays
     where date::text = $1
       and id != $2
       and is_active = true`,
    [jMinus1ISO, aid.id],
  );
  const multiplier = coincide.length > 0 ? 2.0 : 1.5;
  const j1Label = aid.label.replace(/\s+1447|\s+1448|\s+1449|\s+1450/, (m) =>
    m + " — j-1"
  ).replace(/(Aïd al-[A-Za-z]+)$/, "$1 — j-1");
  // Fallback si replace n'a rien fait :
  const finalLabel = j1Label === aid.label ? `${aid.label} — j-1` : j1Label;

  // Existe-t-il deja un J-1 pour cet Aid ?
  const { rows: exists } = await c.query(
    `select id, date::text as date_text from holidays
     where date::text = $1 and label ilike $2`,
    [jMinus1ISO, `%${aid.label.split(" — ")[0]}% j-1%`],
  );

  if (exists.length > 0) {
    console.log(`  ${aid.date_text} ${aid.label} -> J-1=${jMinus1ISO} deja present (update multiplier=${multiplier})`);
    if (APPLY) {
      await c.query(
        `update holidays set staff_multiplier=$1, shops_closed=false, priority=3 where id=$2`,
        [multiplier, exists[0].id],
      );
      updated++;
    }
  } else {
    console.log(`  ${aid.date_text} ${aid.label} -> CREE J-1=${jMinus1ISO} multiplier=${multiplier}${coincide.length > 0 ? ` (coincide: ${coincide.map((c)=>c.label).join(", ")})` : ""}`);
    if (APPLY) {
      await c.query(
        `insert into holidays (date, label, kind, country, region, priority,
           recurring_yearly, is_active, tradition, shops_closed, staff_multiplier)
         values ($1, $2, $3, $4, $5, 3, $6, true, $7, false, $8)`,
        [
          jMinus1ISO,
          finalLabel,
          aid.kind,
          aid.country,
          aid.region,
          aid.recurring_yearly,
          aid.tradition || "Veille d'Aïd : grand rush en boutique caftan.",
          multiplier,
        ],
      );
      created++;
    }
  }
}
console.log(`\n[3] J-1 : ${created} crees, ${updated} mis a jour.`);

// --- 4. Etat final --------------------------------------------------------
const { rows: final } = await c.query(
  `select date::text as date_text, label, ${colCheck.length > 0 || APPLY ? "shops_closed, staff_multiplier" : "false as shops_closed, 1.0 as staff_multiplier"}
   from holidays
   where is_active = true and date >= current_date and date <= current_date + 365
   order by date`,
);
console.log(`\n[4] Etat final 12 prochains mois :`);
for (const f of final) {
  const closedMark = f.shops_closed ? "🚫 FERME" : "🟢 ouvert";
  const multMark = Number(f.staff_multiplier) > 1.0 ? ` ×${Number(f.staff_multiplier).toFixed(1)} effectif` : "";
  console.log(`  ${f.date_text} | ${closedMark}${multMark} | ${f.label}`);
}

console.log(`\n${APPLY ? "✅" : "[DRY-RUN]"}`);
await c.end();
