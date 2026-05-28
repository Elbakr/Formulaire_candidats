// Audit global : pour chaque shift de la semaine (et la suivante), verifier que
// le site_id du shift correspond a au moins un site_assignment ACTIF de l
// employe a la date du shift. Sinon, c est une incoherence. Karim 20/05.

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

// Fenetre : semaine en cours + 4 a venir = ce qu un RH voit dans le planning
const today = new Date();
const day = today.getDay();
const diff = day === 0 ? -6 : 1 - day;
const monday = new Date(today);
monday.setDate(monday.getDate() + diff);
const sunday = new Date(monday);
sunday.setDate(sunday.getDate() + 35); // 5 semaines
const startISO = monday.toISOString().slice(0, 10);
const endISO = sunday.toISOString().slice(0, 10);

console.log(`\n=== Audit shifts du ${startISO} au ${endISO} ===\n`);

const { rows: all } = await c.query(
  `select s.id, s.employee_id, s.date::text as date_text, s.start_time, s.end_time,
          s.site_id, si.code as shift_site_code, si.name as shift_site_name,
          s.generation_note, s.created_at,
          e.full_name
   from shifts s
   join employees e on e.id = s.employee_id
   left join sites si on si.id = s.site_id
   where s.date between $1 and $2
     and e.status = 'active'
   order by e.full_name, s.date, s.start_time`,
  [startISO, endISO],
);

const { rows: assigns } = await c.query(
  `select sa.employee_id, sa.site_id, sa.is_primary,
          sa.start_date::text as start_text,
          sa.end_date::text as end_text,
          si.code as code, si.name
   from site_assignments sa
   join sites si on si.id = sa.site_id`,
);

function activeAssignmentsAt(empId, dateStr) {
  return assigns.filter(
    (a) =>
      a.employee_id === empId &&
      (a.start_text == null || a.start_text <= dateStr) &&
      (a.end_text == null || a.end_text >= dateStr),
  );
}

const issues = [];
const noSiteIssue = [];

for (const s of all) {
  if (s.site_id == null) {
    noSiteIssue.push(s);
    continue;
  }
  const dateStr = s.date_text;
  const active = activeAssignmentsAt(s.employee_id, dateStr);
  const codes = active.map((a) => a.code);
  if (active.length === 0) {
    issues.push({ ...s, reason: "Aucun site_assignment actif a cette date" });
  } else if (!codes.includes(s.shift_site_code)) {
    issues.push({ ...s, reason: `Shift site=${s.shift_site_code} mais employe assigne a [${codes.join(",")}]` });
  }
}

console.log(`Total shifts dans la fenetre: ${all.length}`);
console.log(`Shifts sans site_id: ${noSiteIssue.length}`);
console.log(`Shifts avec mismatch site_id vs assignments: ${issues.length}`);
if (noSiteIssue.length > 0) {
  console.log(`\n--- Shifts sans site_id ---`);
  for (const s of noSiteIssue.slice(0, 50)) {
    console.log(`  ${s.date_text} ${s.start_time.slice(0, 5)} | ${s.full_name}`);
  }
}
if (issues.length > 0) {
  console.log(`\n--- Mismatches (max 80 affiches) ---`);
  const byEmp = new Map();
  for (const i of issues) {
    const arr = byEmp.get(i.full_name) ?? [];
    arr.push(i);
    byEmp.set(i.full_name, arr);
  }
  let shown = 0;
  for (const [name, list] of [...byEmp.entries()].sort()) {
    console.log(`\n  ${name} (${list.length} mismatch${list.length > 1 ? "es" : ""}):`);
    for (const s of list) {
      console.log(
        `    ${s.date_text} ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)} | ${s.reason}`,
      );
      shown += 1;
      if (shown >= 80) break;
    }
    if (shown >= 80) break;
  }
}

// Pour chaque employe avec mismatch, montrer ses sites valides + ce que le shift devrait etre
console.log(`\n\n=== Resume par employe (employes en mismatch uniquement) ===`);
const empsWithIssues = new Set(issues.map((i) => i.employee_id));
for (const empId of empsWithIssues) {
  const emp = all.find((s) => s.employee_id === empId);
  if (!emp) continue;
  const empAssigns = assigns.filter((a) => a.employee_id === empId);
  const activeNow = empAssigns.filter(
    (a) =>
      (a.start_date == null || a.start_date.toISOString().slice(0, 10) <= startISO) &&
      (a.end_date == null || a.end_date.toISOString().slice(0, 10) >= startISO),
  );
  const codes = activeNow.map((a) => `${a.code}${a.is_primary ? "*" : ""}`);
  const cntShifts = all.filter((s) => s.employee_id === empId).length;
  const cntMism = issues.filter((s) => s.employee_id === empId).length;
  console.log(`  ${emp.full_name} | assigne [${codes.join(",")}] | ${cntMism}/${cntShifts} shifts en mismatch`);
}

await c.end();
