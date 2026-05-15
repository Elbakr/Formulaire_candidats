#!/usr/bin/env node
// Backfill site_id sur les shifts qui ont site_id=null en utilisant le site
// primaire de chaque employe (site_assignments where is_primary=true).
//
// Origine du bug (corrige par commitDraftsAction patch 15/05) : l ancien
// "Generer la semaine" du calendar n incluait pas site_id, generant des
// shifts orphelins. Ce script repare le passe.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL missing"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: orphans } = await c.query(`
  select s.id, s.employee_id, e.full_name, s.date
  from shifts s
  join employees e on e.id = s.employee_id
  where s.site_id is null
  order by s.date, s.start_time;
`);
console.log(`${orphans.length} shifts orphelins detectes.`);

if (orphans.length === 0) {
  console.log("Rien a faire.");
  await c.end();
  process.exit(0);
}

const empIds = [...new Set(orphans.map((o) => o.employee_id))];
const { rows: assigns } = await c.query(
  `select employee_id, site_id, is_primary, start_date, end_date
   from site_assignments
   where employee_id = any($1::uuid[])
     and start_date <= current_date
     and (end_date is null or end_date >= current_date)
   order by employee_id, is_primary desc`,
  [empIds],
);

const siteByEmp = new Map();
for (const a of assigns) {
  if (!siteByEmp.has(a.employee_id)) siteByEmp.set(a.employee_id, a.site_id);
}

let fixed = 0;
let stillOrphan = 0;
const stillByEmp = new Map();
for (const o of orphans) {
  const siteId = siteByEmp.get(o.employee_id);
  if (!siteId) {
    stillOrphan++;
    stillByEmp.set(o.full_name, (stillByEmp.get(o.full_name) ?? 0) + 1);
    continue;
  }
  await c.query("update shifts set site_id = $1 where id = $2", [siteId, o.id]);
  fixed++;
}

console.log(`Fixed: ${fixed}`);
console.log(`Still orphan (employes sans site assigne): ${stillOrphan}`);
if (stillByEmp.size > 0) {
  console.log("Employes a affecter dans /admin :");
  for (const [name, n] of stillByEmp) console.log(`  - ${name} (${n} shifts)`);
}

await c.end();
