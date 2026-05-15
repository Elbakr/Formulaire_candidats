// Fix Karim 15/05 : Lundi Pentecote et Aid al-Adha 2026 mal places.
// Aid al-Adha 1447 H tombe astronomiquement le 27 mai 2026 (calcul officiel),
// mais Karim utilise comme reference 26 mai (selon usage Belgique/observation
// lunaire dominante). En base actuelle : Aid al-Adha=25 mai (faux) ;
// Lundi Pentecote=24 mai (faux, c est dimanche).
//
// Bonnes dates :
//   - Lundi de Pentecote 2026  : 25 mai (lundi) - Paques + 50 jours
//   - Aid al-Adha 1447 j-1     : 25 mai (collision Pentecote, MAX staff_mult)
//   - Aid al-Adha 1447         : 26 mai (mardi)
//   - Aid al-Adha 1447 j+1     : 27 mai (mercredi)
//
// Bonus : ajoute staff_multiplier sur Pentecote (1.5x rush) et Aid j+1 (1.5x post-fete).
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

console.log(`\n=== Fix mai 2026 (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

const fixes = [
  {
    matchLabel: "Lundi de Pentecôte",
    fromDate: "2026-05-24",
    toDate: "2026-05-25",
    setStaffMultiplier: 1.5,
    setShopsClosed: false,
  },
  {
    matchLabel: "Aïd al-Adha 1447 — j-1",
    fromDate: "2026-05-24",
    toDate: "2026-05-25",
    setStaffMultiplier: 2.0,
    setShopsClosed: false,
  },
  {
    matchLabel: "Aïd al-Adha 1447",
    fromDate: "2026-05-25",
    toDate: "2026-05-26",
    setStaffMultiplier: 1.0,
    setShopsClosed: true,
  },
  {
    matchLabel: "Aïd al-Adha 1447 — j+1",
    fromDate: "2026-05-26",
    toDate: "2026-05-27",
    setStaffMultiplier: 1.5,
    setShopsClosed: false,
  },
];

for (const f of fixes) {
  // Match par date + ILIKE sur label (case-insensitive, evite probleme em-dash/accents)
  // Construit pattern minimal a partir des premiers mots distinctifs.
  const labelPattern = f.matchLabel.includes("Pentec")
    ? "%entec%"
    : f.matchLabel.includes("j-1")
      ? "%dha%j-1%"
      : f.matchLabel.includes("j+1")
        ? "%dha%j+1%"
        : "%al-Adha 1447";
  const { rows } = await c.query(
    `select id, date, label, shops_closed, staff_multiplier
     from holidays
     where date = $1 and label ilike $2`,
    [f.fromDate, labelPattern],
  );
  if (rows.length === 0) {
    console.log(`[SKIP] "${f.matchLabel}" @ ${f.fromDate} (pattern ${labelPattern}) non trouve`);
    continue;
  }
  // Si plusieurs match, on prend l entree pour laquelle le label exclut les
  // variantes (ex : "Aid al-Adha 1447" tout court ne doit pas matcher j-1/j+1).
  const row = f.matchLabel.includes("j-1") || f.matchLabel.includes("j+1")
    ? rows[0]
    : rows.find((r) => !r.label.includes("j-1") && !r.label.includes("j+1")) ?? rows[0];
  console.log(
    `[FIX]  "${row.label}" id=${row.id} : ${f.fromDate} -> ${f.toDate} | staff_mult ${row.staff_multiplier ?? "—"} -> ${f.setStaffMultiplier} | shops_closed ${row.shops_closed} -> ${f.setShopsClosed}`,
  );
  if (APPLY) {
    // Verifie qu il n y a pas deja une entree (date cible, meme label) — eviter doublon
    const { rows: existing } = await c.query(
      `select id from holidays where date = $1 and label = $2 and id <> $3`,
      [f.toDate, row.label, row.id],
    );
    if (existing.length > 0) {
      await c.query(
        `update holidays set staff_multiplier = $1, shops_closed = $2, is_active = true where id = $3`,
        [f.setStaffMultiplier, f.setShopsClosed, existing[0].id],
      );
      await c.query(`delete from holidays where id = $1`, [row.id]);
      console.log(`       -> entree cible existait, mise a jour + suppression doublon`);
    } else {
      await c.query(
        `update holidays
         set date = $1, staff_multiplier = $2, shops_closed = $3, is_active = true
         where id = $4`,
        [f.toDate, f.setStaffMultiplier, f.setShopsClosed, row.id],
      );
    }
  }
}

console.log(`\n--- Etat apres fix (20-31 mai 2026) ---`);
const { rows: after } = await c.query(`
  select date, label, kind, is_active, shops_closed, staff_multiplier
  from holidays
  where date >= '2026-05-20' and date <= '2026-05-31'
  order by date, id
`);
for (const r of after) {
  const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date;
  const flag = r.shops_closed ? "🚫 FERME" : "✅ OUVERT";
  console.log(
    `  ${d} | ${r.label.padEnd(30)} | ${flag} | staff_mult=${r.staff_multiplier ?? "—"}`,
  );
}

console.log(`\n${APPLY ? "✅ Fix applique." : "[DRY-RUN] Relance avec --apply."}\n`);
await c.end();
