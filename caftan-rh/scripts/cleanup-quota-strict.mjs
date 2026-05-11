// Stratégie B — Cleanup STRICT des shifts contractuels en dépassement.
//
// Pour chaque employé actif, pour chaque semaine (du -8 au +12) où la somme
// des heures contractuelles (`is_overtime = false`) dépasse `weekly_hours` :
//   1. On trie les shifts contractuels de cette semaine par `created_at DESC`
//      (les plus récents d'abord).
//   2. On les supprime un par un jusqu'à ce que la somme restante soit
//      inférieure ou égale à `weekly_hours`.
//
// Mode dry-run par défaut. Pass `--apply` pour exécuter pour de vrai.
// Les shifts `is_overtime = true` ne sont JAMAIS touchés.

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

const today = new Date();
const past = new Date(today.getTime() - 8 * 7 * 86_400_000);
const future = new Date(today.getTime() + 12 * 7 * 86_400_000);

function pad(n) { return String(n).padStart(2, "0"); }
function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoMonday(d) {
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + offset);
  m.setHours(0, 0, 0, 0);
  return toISO(m);
}
function durHours(start, end, breakMin) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - sh * 60 - sm - (breakMin || 0)) / 60;
}

const { rows: emps } = await c.query(`
  select id, full_name, weekly_hours
  from employees
  where status = 'active'
  order by full_name
`);

console.log(`\n=== Cleanup STRICT (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
console.log(`Fenêtre : ${toISO(past)} → ${toISO(future)}\n`);

let totalShiftsToDelete = 0;
let totalHoursToDelete = 0;
const deleteIds = [];

for (const e of emps) {
  const target = e.weekly_hours ?? 38;
  const { rows: shifts } = await c.query(
    `select id, date, start_time, end_time, break_minutes, is_overtime, created_at
     from shifts
     where employee_id = $1 and date between $2 and $3
     order by created_at desc`,
    [e.id, toISO(past), toISO(future)],
  );
  if (shifts.length === 0) continue;

  // Group by week
  const byWeek = new Map();
  for (const s of shifts) {
    const d = s.date instanceof Date ? s.date : new Date(s.date + "T00:00:00");
    const wk = isoMonday(d);
    const arr = byWeek.get(wk) ?? [];
    arr.push({ ...s, hours: durHours(s.start_time, s.end_time, s.break_minutes) });
    byWeek.set(wk, arr);
  }

  const personDeletes = [];
  for (const [wk, ws] of byWeek) {
    const contract = ws.filter((s) => !s.is_overtime).sort((a, b) => b.created_at - a.created_at);
    const ot = ws.filter((s) => s.is_overtime);
    let sumContract = contract.reduce((acc, s) => acc + s.hours, 0);
    if (sumContract <= target) continue;
    // Supprimer les plus récents jusqu'à passer sous le cap
    for (const s of contract) {
      if (sumContract <= target) break;
      personDeletes.push({ shift_id: s.id, date: s.date, hours: s.hours, week: wk });
      sumContract -= s.hours;
    }
  }
  if (personDeletes.length === 0) continue;

  const personHours = personDeletes.reduce((acc, d) => acc + d.hours, 0);
  console.log(`${e.full_name.padEnd(28)} cible ${target}h | à supprimer : ${personDeletes.length} shifts / ${personHours.toFixed(1)}h`);
  totalShiftsToDelete += personDeletes.length;
  totalHoursToDelete += personHours;
  deleteIds.push(...personDeletes.map((d) => d.shift_id));
}

console.log(`\n=== SYNTHÈSE ===`);
console.log(`Total shifts à supprimer : ${totalShiftsToDelete}`);
console.log(`Total heures à libérer   : ${totalHoursToDelete.toFixed(1)}h`);

if (!APPLY) {
  console.log(`\n[DRY-RUN] Aucune suppression effectuée. Relance avec --apply pour exécuter.`);
} else if (deleteIds.length === 0) {
  console.log(`\nRien à supprimer.`);
} else {
  // Suppression en batch
  const { rowCount } = await c.query(
    `delete from shifts where id = any($1::uuid[])`,
    [deleteIds],
  );
  console.log(`\n✅ ${rowCount} shifts supprimés.`);
}

await c.end();
