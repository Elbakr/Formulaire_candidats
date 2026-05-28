// Fix data : pour chaque (employee_id, site_id) ou il y a au moins 1 shift
// mais aucune site_assignment ACTIVE a la date du shift, cree un assignment
// is_primary=false couvrant la periode min->max des shifts concernes.
//
// Karim 20/05 : le solver site avait pioche en tier 3 (renfort cross-site)
// sans creer l affectation administrative correspondante. Cela cree des
// incoherences visuelles entre la page site et la fiche employe. Ce script
// recolle les affectations en arriere de la donnee existante.
//
// USAGE : node scripts/fix-cross-site-assignments.mjs [--dry] [--apply]
//   --dry (default) : affiche ce qui serait fait sans modifier la DB
//   --apply        : applique les corrections

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log(`\n=== Cross-site assignments fix (${MODE}) ===\n`);

// Fenetre : tout shift a partir d aujourd hui jusqu a 60 jours plus tard
const today = new Date();
const futureLimit = new Date(today);
futureLimit.setDate(futureLimit.getDate() + 60);
const startISO = today.toISOString().slice(0, 10);
const endISO = futureLimit.toISOString().slice(0, 10);

// FIX TZ : on caste en text cote Postgres pour eviter le decalage UTC->local.
const { rows: shifts } = await c.query(
  `select s.id, s.employee_id, s.date::text as date_text, s.site_id,
          si.code as site_code, e.full_name
   from shifts s
   join employees e on e.id = s.employee_id
   left join sites si on si.id = s.site_id
   where s.date between $1 and $2
     and s.site_id is not null
     and e.status = 'active'
   order by s.employee_id, s.site_id, s.date`,
  [startISO, endISO],
);

const { rows: assigns } = await c.query(
  `select employee_id, site_id,
          start_date::text as start_text,
          end_date::text as end_text,
          is_primary
   from site_assignments`,
);

function activeAt(empId, siteId, dateStr) {
  return assigns.find(
    (a) =>
      a.employee_id === empId &&
      a.site_id === siteId &&
      a.start_text <= dateStr &&
      (a.end_text == null || a.end_text >= dateStr),
  );
}

const groups = new Map();
for (const s of shifts) {
  const k = `${s.employee_id}|${s.site_id}`;
  const arr = groups.get(k) ?? { empId: s.employee_id, siteId: s.site_id, full_name: s.full_name, site_code: s.site_code, dates: [] };
  arr.dates.push(s.date_text);
  groups.set(k, arr);
}

const toCreate = [];
for (const [, g] of groups) {
  // Verifie si TOUS les shifts ont une assignment active
  const uncovered = g.dates.filter((d) => !activeAt(g.empId, g.siteId, d));
  if (uncovered.length === 0) continue;
  const min = uncovered.sort()[0];
  const max = uncovered.sort()[uncovered.length - 1];
  toCreate.push({
    employee_id: g.empId,
    site_id: g.siteId,
    full_name: g.full_name,
    site_code: g.site_code,
    start_date: min,
    end_date: max,
    n_shifts: uncovered.length,
  });
}

console.log(`Trouve ${toCreate.length} assignment(s) a creer pour aligner les renforts cross-site.\n`);

for (const a of toCreate) {
  console.log(
    `  ${a.full_name} -> site ${a.site_code} | ${a.start_date} -> ${a.end_date} | ${a.n_shifts} shift(s)`,
  );
}

if (toCreate.length === 0) {
  console.log("\nRien a corriger.");
  await c.end();
  process.exit(0);
}

if (!APPLY) {
  console.log(`\n(DRY-RUN) Pour appliquer : node scripts/fix-cross-site-assignments.mjs --apply`);
  await c.end();
  process.exit(0);
}

console.log(`\n--- APPLY ---`);
const note = "Auto-aligne renfort cross-site solver - 2026-05-20";
let created = 0;
let extended = 0;
for (const a of toCreate) {
  // Karim 2026-05-21 : si un assignment existe deja pour (emp, site) sur une
  // periode chevauchante, on ETEND ses bornes au lieu de creer un doublon
  // (qui serait bloque par le trigger anti-chevauchement).
  const existing = await c.query(
    `select id, start_date::text as sd, end_date::text as ed
       from site_assignments
      where employee_id = $1 and site_id = $2
        and start_date <= $4 and coalesce(end_date, '9999-12-31'::date) >= $3
      order by is_primary desc, (end_date is null) desc, start_date desc
      limit 1`,
    [a.employee_id, a.site_id, a.start_date, a.end_date],
  );
  if (existing.rowCount > 0) {
    const ex = existing.rows[0];
    const newStart = ex.sd < a.start_date ? ex.sd : a.start_date;
    const newEnd = ex.ed == null
      ? null
      : (ex.ed > a.end_date ? ex.ed : a.end_date);
    await c.query(
      `update site_assignments set start_date=$2, end_date=$3, notes=$4 where id=$1`,
      [ex.id, newStart, newEnd, note],
    );
    extended += 1;
    console.log(`  → ETEND ${a.full_name} -> ${a.site_code} (${ex.sd}->${ex.ed ?? 'NULL'} devient ${newStart}->${newEnd ?? 'NULL'})`);
    continue;
  }
  const r = await c.query(
    `insert into site_assignments (employee_id, site_id, start_date, end_date, is_primary, notes)
     values ($1, $2, $3, $4, false, $5)
     returning id`,
    [a.employee_id, a.site_id, a.start_date, a.end_date, note],
  );
  if (r.rowCount === 1) {
    created += 1;
    console.log(
      `  ✓ ${a.full_name} -> ${a.site_code} (id=${r.rows[0].id.slice(0, 8)}…)`,
    );
  } else {
    console.log(`  ✗ ${a.full_name} -> ${a.site_code} : echec insert`);
  }
}
console.log(`\nCree ${created} / Etendu ${extended} (total ${created + extended}/${toCreate.length}).`);
await c.end();
