// Diag Ilham : repartition heures contractuelles cette semaine.
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
  `select id, full_name, weekly_hours, contract_type from employees where full_name ilike '%ilham%'`,
);
console.log("Ilham(s) :", emps);

for (const e of emps) {
  console.log(`\n=== ${e.full_name} (cible ${e.weekly_hours}h/sem) ===`);
  const { rows: shifts } = await c.query(
    `select s.id, s.date::text as d, s.start_time, s.end_time, s.break_minutes,
            s.is_overtime, s.overtime_multiplier, s.created_at::text as created,
            p.full_name as creator, si.code as site
     from shifts s
     left join profiles p on p.id = s.created_by
     left join sites si on si.id = s.site_id
     where s.employee_id = $1
       and s.date >= '2026-05-11' and s.date <= '2026-05-17'
     order by s.date, s.start_time`,
    [e.id],
  );
  let totalC = 0, totalOT = 0;
  for (const s of shifts) {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    const dur = (eh * 60 + em - sh * 60 - sm - (s.break_minutes || 0)) / 60;
    if (s.is_overtime) totalOT += dur; else totalC += dur;
    console.log(`  ${s.id.slice(0,8)} | ${s.d} ${s.start_time.slice(0,5)}-${s.end_time.slice(0,5)} (${dur.toFixed(1)}h) ${s.is_overtime ? "[OT×"+s.overtime_multiplier+"]" : "[contract]"} site=${s.site ?? "—"} by=${s.creator ?? "?"} at ${s.created.slice(0,16)}`);
  }
  console.log(`  TOTAL contractuel: ${totalC.toFixed(1)}h | OT: ${totalOT.toFixed(1)}h`);
}

await c.end();
