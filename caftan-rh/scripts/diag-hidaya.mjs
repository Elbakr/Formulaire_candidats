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
  `select id, full_name, weekly_hours, contract_type from employees where full_name ilike '%hidaya%'`,
);
console.log("Hidaya rows:", emps);
if (!emps[0]) { await c.end(); process.exit(0); }

const empId = emps[0].id;

const { rows: shifts } = await c.query(
  `select s.id, s.date, s.start_time, s.end_time, s.break_minutes,
          s.is_overtime, s.overtime_multiplier, s.position, s.location,
          s.site_id, si.code as site_code,
          s.notes, s.status, s.created_at, s.created_by,
          p.full_name as created_by_name
   from shifts s
   left join sites si on si.id = s.site_id
   left join profiles p on p.id = s.created_by
   where s.employee_id = $1
   order by s.date, s.start_time`,
  [empId],
);
console.log(`\n=== Tous les shifts d'Hidaya (${shifts.length}) ===`);
for (const s of shifts) {
  const d = s.date instanceof Date ? s.date : new Date(s.date + "T00:00:00");
  const dateStr = d.toISOString().slice(0, 10);
  const [sh, sm] = s.start_time.split(":").map(Number);
  const [eh, em] = s.end_time.split(":").map(Number);
  const dur = (eh * 60 + em - sh * 60 - sm - (s.break_minutes || 0)) / 60;
  console.log(`  ${s.id.slice(0, 8)} | ${dateStr} ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)} (${dur.toFixed(1)}h) ` +
    `${s.is_overtime ? `[OT×${s.overtime_multiplier}]` : "[contract]"} ` +
    `site=${s.site_code ?? "—"} pos=${s.position ?? "—"} loc=${s.location ?? "—"} ` +
    `status=${s.status} created_at=${s.created_at.toISOString().slice(0, 16)} by=${s.created_by_name ?? "?"} ` +
    `notes=${s.notes ?? ""}`);
}

await c.end();
