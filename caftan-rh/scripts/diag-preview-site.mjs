// Diag rapide : simule previewSitePlanAction pour site A semaine en cours
// pour comprendre pourquoi multi-sites donne 0 shifts.
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

const today = new Date();
const monday = new Date(today);
const offset = today.getDay() === 0 ? -6 : 1 - today.getDay();
monday.setDate(today.getDate() + offset);
const mondayISO = monday.toISOString().slice(0, 10);
const sundayISO = new Date(monday.getTime() + 6 * 86400000).toISOString().slice(0, 10);
const tomorrowISO = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

console.log(`Aujourd'hui : ${today.toISOString().slice(0,10)} ${["dim","lun","mar","mer","jeu","ven","sam"][today.getDay()]}`);
console.log(`Monday de la semaine en cours : ${mondayISO}`);
console.log(`Sunday : ${sundayISO}`);
console.log(`J+1 (tomorrowISO) : ${tomorrowISO}`);
console.log(`Jours planifiables cette semaine (>= J+1) :`);
for (let i = 0; i < 7; i++) {
  const d = new Date(monday.getTime() + i * 86400000);
  const iso = d.toISOString().slice(0,10);
  const dayName = ["dim","lun","mar","mer","jeu","ven","sam"][d.getDay()];
  console.log(`  ${iso} ${dayName} : ${iso >= tomorrowISO ? "✓ planifiable" : "✗ skip (passe/aujourd'hui)"}`);
}

for (const code of ["A", "B", "C", "D", "E", "F"]) {
  const { rows: siteRow } = await c.query(`select id from sites where code = $1`, [code]);
  if (siteRow.length === 0) continue;
  const siteId = siteRow[0].id;
  const { rows: needs } = await c.query(
    `select day_of_week, count(*) as n, sum(headcount) as hc
     from site_needs where site_id = $1 and is_enabled = true group by day_of_week order by day_of_week`,
    [siteId],
  );
  const { rows: shifts } = await c.query(
    `select count(*) as n from shifts
     where site_id = $1 and date between $2 and $3`,
    [siteId, mondayISO, sundayISO],
  );
  console.log(`\n=== Site ${code} ===`);
  console.log(`  Needs is_enabled par jour : ${needs.map(n => ["d","l","m","M","j","v","s"][n.day_of_week]+":"+n.hc).join(", ")}`);
  console.log(`  Shifts deja existants cette semaine : ${shifts[0].n}`);
}

await c.end();
