// Audit complet des dépassements de quota contractuel chez tous les employés
// actifs. Pour chaque employé, sur les 8 semaines passées + 8 semaines à venir,
// on calcule : heures planifiées contractuelles, heures sup, ratio.
//
// Lecture seule — ne modifie rien.

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
const past = new Date(today.getTime() - 8 * 7 * 86_400_000);
const future = new Date(today.getTime() + 8 * 7 * 86_400_000);

function isoMonday(d) {
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + offset);
  m.setHours(0, 0, 0, 0);
  return m.toISOString().slice(0, 10);
}

const { rows: emps } = await c.query(`
  select id, full_name, weekly_hours, contract_type, status
  from employees where status = 'active'
  order by full_name
`);

console.log(`\n=== Audit quota : ${emps.length} employés actifs ===`);
console.log(`Fenêtre : ${past.toISOString().slice(0,10)} → ${future.toISOString().slice(0,10)} (16 semaines)\n`);

const findings = [];

for (const e of emps) {
  const { rows: shifts } = await c.query(
    `select date, start_time, end_time, break_minutes, is_overtime
     from shifts
     where employee_id = $1 and date between $2 and $3
     order by date`,
    [e.id, past.toISOString().slice(0,10), future.toISOString().slice(0,10)],
  );
  if (shifts.length === 0) continue;

  const target = e.weekly_hours ?? 38;
  const byWeek = new Map();
  for (const s of shifts) {
    const d = s.date instanceof Date ? s.date : new Date(s.date + "T00:00:00");
    const wk = isoMonday(d);
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    const dur = (eh * 60 + em - sh * 60 - sm - (s.break_minutes || 0)) / 60;
    const cur = byWeek.get(wk) ?? { contract: 0, ot: 0 };
    if (s.is_overtime) cur.ot += dur;
    else cur.contract += dur;
    byWeek.set(wk, cur);
  }

  let overshootWeeks = 0;
  let maxOvershoot = 0;
  let totalContract = 0;
  let totalOt = 0;
  let totalLegitOt = 0; // heures sup correctement taguées
  for (const [, h] of byWeek) {
    totalContract += h.contract;
    totalOt += h.ot;
    totalLegitOt += h.ot;
    if (h.contract > target) {
      overshootWeeks++;
      const delta = h.contract - target;
      if (delta > maxOvershoot) maxOvershoot = delta;
    }
  }

  const status =
    overshootWeeks > 0 ? "🔴 dépasse" : totalOt > 0 ? "🟡 OT légitime" : "🟢 OK";

  findings.push({
    name: e.full_name,
    contract_type: e.contract_type,
    weekly_target: target,
    weeks_planned: byWeek.size,
    overshoot_weeks: overshootWeeks,
    max_overshoot: maxOvershoot,
    avg_per_week: byWeek.size > 0 ? totalContract / byWeek.size : 0,
    total_contract: totalContract,
    total_ot_legit: totalLegitOt,
    status,
  });
}

// Tri : dépassements d'abord, plus gros d'abord
findings.sort((a, b) => {
  if (a.overshoot_weeks !== b.overshoot_weeks)
    return b.overshoot_weeks - a.overshoot_weeks;
  return b.max_overshoot - a.max_overshoot;
});

console.log("Nom".padEnd(28) + "Contrat".padEnd(10) + "Cible/sem".padEnd(11) + "Moy/sem".padEnd(10) + "Sem dépass.".padEnd(13) + "Max dépass.".padEnd(13) + "OT légit".padEnd(11) + "Statut");
console.log("─".repeat(110));
for (const f of findings) {
  console.log(
    f.name.padEnd(28) +
      (f.contract_type ?? "?").padEnd(10) +
      `${f.weekly_target}h`.padEnd(11) +
      `${f.avg_per_week.toFixed(1)}h`.padEnd(10) +
      `${f.overshoot_weeks}/${f.weeks_planned}`.padEnd(13) +
      `+${f.max_overshoot.toFixed(1)}h`.padEnd(13) +
      `${f.total_ot_legit.toFixed(1)}h`.padEnd(11) +
      f.status,
  );
}

const totalProblems = findings.filter((f) => f.overshoot_weeks > 0).length;
console.log("\n=== SYNTHÈSE ===");
console.log(`Employés en dépassement (au moins 1 semaine) : ${totalProblems} / ${findings.length}`);

await c.end();
