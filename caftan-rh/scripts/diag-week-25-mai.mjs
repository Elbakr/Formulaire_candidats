// Diag complet semaine 25-31 mai : closures, leaves approuves, indispos.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log(`\n=== Diag semaine 25-31 mai 2026 ===\n`);

// Company closures
const { rows: closures } = await c.query(`
  select start_date::text as s, end_date::text as e, department_id
  from company_closures
  where end_date >= '2026-05-25' and start_date <= '2026-05-31'
`);
console.log(`Company closures chevauchant semaine 25-31 mai : ${closures.length}`);
for (const r of closures) console.log(`  ${r.s} -> ${r.e} | dept=${r.department_id ?? "global"}`);

// Conges approuves (table peut s appeler conges_requests selon repo)
const { rows: tables } = await c.query(`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name ilike '%cong%' or table_name ilike '%leave%'
`);
console.log(`\nTables conges trouvees :`);
for (const t of tables) console.log(`  ${t.table_name}`);

// Total employes actifs
const { rows: emps } = await c.query(`
  select count(*)::int as n from employees where status = 'active'
`);
console.log(`\nEmployes actifs : ${emps[0].n}`);

// Indispos sur lundi (dow=1)
const { rows: unav } = await c.query(`
  select count(*)::int as n
  from employee_unavailabilities
  where is_active = true
    and (day_of_week = 1 or (date_specific between '2026-05-25' and '2026-05-25'))
`);
console.log(`Indispos couvrant lundi 25 mai : ${unav[0].n}`);

// Indispos sur mercredi (dow=3)
const { rows: unav3 } = await c.query(`
  select count(*)::int as n
  from employee_unavailabilities
  where is_active = true
    and (day_of_week = 3 or (date_specific between '2026-05-27' and '2026-05-27'))
`);
console.log(`Indispos couvrant mercredi 27 mai : ${unav3[0].n}`);

// Site needs : tous les sites ont-ils des besoins le lundi (dow=1) ?
const { rows: needsByDow } = await c.query(`
  select day_of_week, count(distinct site_id)::int as sites, count(*)::int as slots
  from site_needs
  group by day_of_week
  order by day_of_week
`);
console.log(`\nSite_needs par jour de semaine :`);
console.log(`  dow 0=dim, 1=lun, 2=mar, 3=mer, 4=jeu, 5=ven, 6=sam`);
for (const r of needsByDow)
  console.log(`  dow=${r.day_of_week} | ${r.sites} sites | ${r.slots} slots`);

await c.end();
