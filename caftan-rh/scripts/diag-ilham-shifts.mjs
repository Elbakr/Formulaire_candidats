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
  `select id, full_name, weekly_hours, contract_type, status
   from employees where full_name ilike '%ilham%' order by full_name`,
);
console.log("\n=== Employees matching 'ilham' ===");
for (const e of emps) console.log(` ${e.id} | ${e.full_name} | weekly=${e.weekly_hours}h | ${e.contract_type} | ${e.status}`);

for (const e of emps) {
  const { rows: shifts } = await c.query(
    `select s.id, s.date, s.start_time, s.end_time, s.break_minutes,
            s.position, s.is_overtime, s.overtime_multiplier, s.notes,
            s.created_at, s.created_by,
            si.code as site_code,
            p.full_name as created_by_name
     from shifts s
     left join sites si on si.id = s.site_id
     left join profiles p on p.id = s.created_by
     where s.employee_id = $1
     order by s.date, s.start_time`,
    [e.id],
  );
  console.log(`\n--- Shifts pour ${e.full_name} (${shifts.length} total) ---`);
  let totalContractual = 0;
  let totalOvertime = 0;
  for (const s of shifts) {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    const dur = (eh * 60 + em - sh * 60 - sm - (s.break_minutes || 0)) / 60;
    if (s.is_overtime) totalOvertime += dur;
    else totalContractual += dur;
    console.log(
      ` ${s.date} ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)} (${dur.toFixed(1)}h) ` +
        `${s.is_overtime ? "[OT×" + s.overtime_multiplier + "]" : "[contract]"} ` +
        `site=${s.site_code ?? "—"} by=${s.created_by_name ?? "?"} ${s.notes ? "// " + s.notes : ""}`,
    );
  }
  console.log(`  TOTAL contractuel: ${totalContractual.toFixed(1)}h | overtime: ${totalOvertime.toFixed(1)}h | hebdo cible: ${e.weekly_hours}h`);

  // Recalcul par semaine
  const byWeek = new Map();
  for (const s of shifts) {
    const d = new Date(s.date + "T00:00:00");
    const dow = d.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(d.getDate() + offset);
    const wk = monday.toISOString().slice(0, 10);
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    const dur = (eh * 60 + em - sh * 60 - sm - (s.break_minutes || 0)) / 60;
    const cur = byWeek.get(wk) ?? { contract: 0, ot: 0 };
    if (s.is_overtime) cur.ot += dur;
    else cur.contract += dur;
    byWeek.set(wk, cur);
  }
  console.log(`  Par semaine :`);
  for (const [wk, h] of [...byWeek.entries()].sort()) {
    const overshoot = h.contract > (e.weekly_hours ?? 38);
    console.log(`    sem ${wk} : contract=${h.contract.toFixed(1)}h ${overshoot ? "⚠️ DÉPASSEMENT" : ""}  + OT=${h.ot.toFixed(1)}h  = ${(h.contract+h.ot).toFixed(1)}h`);
  }
}

await c.end();
