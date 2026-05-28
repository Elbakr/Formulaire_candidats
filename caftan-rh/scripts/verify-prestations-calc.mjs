// Karim 2026-05-24 : reproduit exactement le calcul de la page Prestations
// pour Keltoum El Mrabet sur mai 2026. Verifie que les totaux sont coherents.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const EMP = "1b2163a3-5e1d-4bfa-acb8-b21685fe4dc8"; // Keltoum
const START = "2026-05-01";
const END = "2026-05-31";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: shifts } = await c.query(
  "select id, site_id, date, start_time, end_time from shifts where employee_id = $1 and date >= $2 and date <= $3 order by date, start_time",
  [EMP, START, END],
);
console.log(`Shifts planifies : ${shifts.length}`);
for (const s of shifts) console.log(`  ${s.date} ${s.start_time}-${s.end_time}`);

const { rows: entries } = await c.query(
  "select id, kind, occurred_at, shift_id, source, auto_clocked_out from clock_entries where employee_id = $1 and occurred_at >= '2026-05-01T00:00:00Z' and occurred_at < '2026-06-01T00:00:00Z' order by occurred_at",
  [EMP],
);
console.log(`\nClock entries : ${entries.length}`);
for (const e of entries) {
  console.log(`  ${e.occurred_at.toISOString().slice(0,16)} | ${e.kind.toUpperCase()} | shift=${e.shift_id?.slice(0,8) ?? '—'} | src=${e.source}`);
}

// Reproduit la logique de page.tsx
const inByShift = new Map();
const outByShift = new Map();
const orphanIns = [];
const orphanOuts = [];
for (const e of entries) {
  if (e.kind === "in") {
    if (e.shift_id) inByShift.set(e.shift_id, e);
    else orphanIns.push(e);
  } else {
    if (e.shift_id) outByShift.set(e.shift_id, e);
    else orphanOuts.push(e);
  }
}

let totalPlanned = 0;
let totalWorked = 0;
let totalShifts = 0;
const nowMs = Date.now();

console.log("\n=== Calcul par SHIFT planifie (PASSES uniquement) ===");
for (const s of shifts) {
  const dateStr = s.date instanceof Date ? s.date.toISOString().slice(0,10) : String(s.date);
  const [sh, sm] = s.start_time.split(":").map(Number);
  const [eh, em] = s.end_time.split(":").map(Number);
  let planned = (eh * 60 + em) - (sh * 60 + sm);
  if (planned < 0) planned += 24 * 60;
  const shiftStartMs = new Date(`${dateStr}T${s.start_time}`).getTime();
  const isFuture = shiftStartMs > nowMs;

  const cIn = inByShift.get(s.id);
  const cOut = outByShift.get(s.id);
  let worked = null;
  if (cIn && cOut) {
    worked = (new Date(cOut.occurred_at).getTime() - new Date(cIn.occurred_at).getTime()) / 60_000;
  }
  if (!isFuture) {
    totalPlanned += planned;
    totalShifts++;
    if (worked != null) totalWorked += worked;
  }
  console.log(`  ${dateStr} ${isFuture ? '(FUTUR)' : ''} | planne=${planned}min | IN=${cIn ? cIn.occurred_at.toISOString().slice(11,16) : '—'} OUT=${cOut ? cOut.occurred_at.toISOString().slice(11,16) : '—'} | travaille=${worked?.toFixed(0) ?? '—'}min`);
}

// Orphans (avec mon fix)
console.log("\n=== Calcul HORS shift (orphans) ===");
const insByOrphanDate = new Map();
const outsByOrphanDate = new Map();
for (const e of orphanIns) {
  const d = e.occurred_at.toISOString().slice(0, 10);
  insByOrphanDate.set(d, [...(insByOrphanDate.get(d) ?? []), e]);
}
for (const e of orphanOuts) {
  const d = e.occurred_at.toISOString().slice(0, 10);
  outsByOrphanDate.set(d, [...(outsByOrphanDate.get(d) ?? []), e]);
}

let totalOrphanWorked = 0;
for (const [date, ins] of [...insByOrphanDate.entries()].sort()) {
  const outs = (outsByOrphanDate.get(date) ?? []).sort((a, b) => a.occurred_at < b.occurred_at ? -1 : 1);
  const sortedIns = [...ins].sort((a, b) => a.occurred_at < b.occurred_at ? -1 : 1);
  for (let i = 0; i < sortedIns.length; i++) {
    const cIn = sortedIns[i];
    const cOut = outs[i] ?? null;
    let worked = null;
    if (cIn && cOut) {
      worked = (new Date(cOut.occurred_at).getTime() - new Date(cIn.occurred_at).getTime()) / 60_000;
      totalOrphanWorked += worked;
    }
    console.log(`  ${date} | HORS-SHIFT | IN=${cIn.occurred_at.toISOString().slice(11,16)} OUT=${cOut ? cOut.occurred_at.toISOString().slice(11,16) : '—'} | travaille=${worked?.toFixed(0) ?? '—'}min`);
  }
}
totalWorked += totalOrphanWorked;
totalShifts += [...insByOrphanDate.values()].reduce((acc, v) => acc + v.length, 0);

console.log("\n=== RESUME ===");
const fmt = (m) => `${Math.floor(m/60)}h${String(Math.round(m%60)).padStart(2,'0')}`;
console.log(`Heures planifiees (shifts uniquement) : ${fmt(totalPlanned)} (${totalPlanned}min)`);
console.log(`Heures travaillees (shifts planifies)  : ${fmt(totalWorked - totalOrphanWorked)}`);
console.log(`Heures travaillees HORS shift          : ${fmt(totalOrphanWorked)}`);
console.log(`Heures travaillees TOTAL               : ${fmt(totalWorked)}`);
console.log(`Diff (travaille - planne)              : ${totalWorked - totalPlanned >= 0 ? '+' : ''}${fmt(totalWorked - totalPlanned)}`);
console.log(`Nb jours travailles                    : ${totalShifts}`);

await c.end();
