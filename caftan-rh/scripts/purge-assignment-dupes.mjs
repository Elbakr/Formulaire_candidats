// Nettoie les doublons de site_assignments actifs. Pour chaque couple
// (employee_id, site_id), garde 1 SEULE ligne :
//   - priorite 1 : is_primary=true
//   - puis : is_site_manager=true
//   - puis : end_date NULL (la plus ouverte)
//   - puis : start_date la plus recente
// Karim 2026-05-21 : doublons crees par mes scripts fix-cross-site successifs.
//
// USAGE :
//   node scripts/purge-assignment-dupes.mjs       # dry run
//   node scripts/purge-assignment-dupes.mjs --apply

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

const todayISO = new Date().toISOString().slice(0, 10);

const { rows: actives } = await c.query(
  `select sa.id, sa.employee_id, sa.site_id, sa.is_primary, sa.is_site_manager,
          sa.start_date::text as sd, sa.end_date::text as ed,
          e.full_name, si.code as site_code
   from site_assignments sa
   join employees e on e.id = sa.employee_id
   join sites si on si.id = sa.site_id
   where sa.start_date <= $1 and (sa.end_date is null or sa.end_date >= $1)
   order by sa.is_primary desc, sa.is_site_manager desc,
            (sa.end_date is null) desc,
            sa.start_date desc`,
  [todayISO],
);

const groups = new Map();
for (const a of actives) {
  const k = `${a.employee_id}|${a.site_id}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(a);
}

const toDelete = [];
const toKeep = [];
for (const [, arr] of groups) {
  if (arr.length === 1) continue;
  // ordre deja par is_primary desc, is_site_manager desc, start_date desc
  toKeep.push(arr[0]);
  for (let i = 1; i < arr.length; i++) toDelete.push(arr[i]);
}

console.log(`Couples avec doublons : ${[...groups.values()].filter((g) => g.length > 1).length}`);
console.log(`Lignes a SUPPRIMER : ${toDelete.length}`);
console.log(`Lignes a GARDER : ${toKeep.length}`);
console.log();

for (const k of toKeep) {
  console.log(`  KEEP   ${k.full_name} -> ${k.site_code} | primary=${k.is_primary} mgr=${k.is_site_manager} | ${k.sd}->${k.ed ?? 'NULL'} | id=${k.id.slice(0, 8)}`);
}
console.log();
for (const d of toDelete) {
  console.log(`  DELETE ${d.full_name} -> ${d.site_code} | primary=${d.is_primary} mgr=${d.is_site_manager} | ${d.sd}->${d.ed ?? 'NULL'} | id=${d.id.slice(0, 8)}`);
}

if (toDelete.length === 0) {
  console.log("\nRien a faire.");
  await c.end();
  process.exit(0);
}

if (!APPLY) {
  console.log(`\n(DRY-RUN) Pour appliquer : node scripts/purge-assignment-dupes.mjs --apply`);
  await c.end();
  process.exit(0);
}

console.log("\n--- APPLY ---");
const ids = toDelete.map((d) => d.id);
const r = await c.query(
  `delete from site_assignments where id = any($1::uuid[]) returning id`,
  [ids],
);
console.log(`Supprime ${r.rowCount}/${ids.length} lignes.`);
await c.end();
