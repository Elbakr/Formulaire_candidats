// Diag : trouve toute incoherence entre site_id d un shift et l affichage cote
// employe / cote site. Karim 20/05.

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

const { rows: emps } = await c.query(
  `select id, full_name, status from employees
   where full_name ilike '%ibtissem%' or full_name ilike '%ibtissam%'
   order by full_name`,
);
console.log("\n=== Employees matching ibtissem/ibtissam ===");
for (const e of emps) console.log(`  ${e.id} | ${e.full_name} | ${e.status}`);

if (emps.length === 0) {
  console.log("Aucune Ibtissem trouvee.");
  await c.end();
  process.exit(0);
}

const todayISO = new Date().toISOString().slice(0, 10);

for (const e of emps) {
  console.log(`\n========== ${e.full_name} (${e.id}) ==========`);

  const { rows: assigns } = await c.query(
    `select sa.id, sa.site_id, sa.is_primary, sa.start_date, sa.end_date,
            si.code, si.name
     from site_assignments sa
     join sites si on si.id = sa.site_id
     where sa.employee_id = $1
     order by sa.is_primary desc, sa.start_date desc`,
    [e.id],
  );
  console.log(`\n  Site assignments (${assigns.length}):`);
  for (const a of assigns) {
    const active = a.start_date <= todayISO && (a.end_date == null || a.end_date >= todayISO);
    console.log(
      `    ${active ? "ACTIVE" : "passe "} | ${a.code} ${a.name} | primary=${a.is_primary} | ${a.start_date}->${a.end_date ?? "ongoing"}`,
    );
  }

  // 14 jours autour d aujourd hui
  const start = new Date(); start.setDate(start.getDate() - 7);
  const end = new Date(); end.setDate(end.getDate() + 14);
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);

  const { rows: shifts } = await c.query(
    `select s.id, s.date, s.start_time, s.end_time,
            s.site_id, si.code as site_code, si.name as site_name,
            s.location, s.position, s.is_overtime, s.generation_note,
            s.created_at
     from shifts s
     left join sites si on si.id = s.site_id
     where s.employee_id = $1 and s.date between $2 and $3
     order by s.date, s.start_time`,
    [e.id, startISO, endISO],
  );

  console.log(`\n  Shifts du ${startISO} au ${endISO} (${shifts.length}):`);
  if (shifts.length === 0) console.log("    aucun.");
  for (const s of shifts) {
    const flag = s.site_id == null ? "⚠️  NO SITE_ID" : "";
    console.log(
      `    ${s.date} ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)} | site_id=${s.site_code ?? "NULL"} (${s.site_id ?? "—"}) | location='${s.location ?? ""}' | pos='${s.position ?? ""}' ${flag}`,
    );
    if (s.location && s.site_code && s.location !== s.site_code) {
      console.log(`        ⚠️  MISMATCH: location='${s.location}' mais site_id='${s.site_code}'`);
    }
  }

  // Clock events recents
  const { rows: clocks } = await c.query(
    `select ce.id, ce.event_type, ce.event_at, ce.site_id, si.code as site_code
     from clock_events ce
     left join sites si on si.id = ce.site_id
     where ce.employee_id = $1 and ce.event_at >= $2
     order by ce.event_at desc
     limit 20`,
    [e.id, startISO + "T00:00:00Z"],
  );
  console.log(`\n  Clock events recents (${clocks.length}):`);
  for (const ev of clocks) {
    console.log(`    ${ev.event_at.toISOString().slice(0, 16)} | ${ev.event_type} | site=${ev.site_code ?? "NULL"}`);
  }
}

// Audit global : tous les shifts avec mismatch location vs site_id
console.log("\n\n=== Audit global : shifts avec mismatch location/site_id (semaine en cours) ===");
const monday = new Date();
const day = monday.getDay(); // 0=Sun..6=Sat
const diff = day === 0 ? -6 : 1 - day; // back to Monday
monday.setDate(monday.getDate() + diff);
const startW = monday.toISOString().slice(0, 10);
const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
const endW = sunday.toISOString().slice(0, 10);

const { rows: mism } = await c.query(
  `select s.date, s.start_time, s.end_time,
          si.code as site_code, s.location,
          e.full_name
   from shifts s
   join employees e on e.id = s.employee_id
   left join sites si on si.id = s.site_id
   where s.date between $1 and $2
     and s.location is not null and s.location <> ''
     and si.code is not null
     and lower(trim(s.location)) <> lower(si.code)
   order by s.date, e.full_name, s.start_time`,
  [startW, endW],
);
console.log(`Trouve ${mism.length} shift(s) avec mismatch location <> site code (du ${startW} au ${endW}):`);
for (const m of mism) {
  console.log(`  ${m.date} ${m.start_time.slice(0, 5)}-${m.end_time.slice(0, 5)} | ${m.full_name} | site_id=${m.site_code} mais location='${m.location}'`);
}

// Shifts sans site_id
const { rows: noSite } = await c.query(
  `select s.date, s.start_time, s.end_time, e.full_name, s.location
   from shifts s
   join employees e on e.id = s.employee_id
   where s.site_id is null and s.date between $1 and $2
   order by s.date, e.full_name`,
  [startW, endW],
);
console.log(`\nShifts sans site_id cette semaine : ${noSite.length}`);
for (const s of noSite) {
  console.log(`  ${s.date} ${s.start_time.slice(0, 5)} | ${s.full_name} | location='${s.location}'`);
}

await c.end();
