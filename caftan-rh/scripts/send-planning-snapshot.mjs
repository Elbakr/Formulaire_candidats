// Envoie a Karim un mail recap du planning actuel : pour chaque site, pour
// chaque jour de la semaine en cours, la liste des shifts (employe, horaire,
// OT, note de generation tronquee). Karim 2026-05-21.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// Semaine en cours : lundi -> dimanche
const today = new Date();
const day = today.getDay();
const diff = day === 0 ? -6 : 1 - day;
const monday = new Date(today);
monday.setDate(monday.getDate() + diff);
const sunday = new Date(monday);
sunday.setDate(sunday.getDate() + 6);
const startISO = monday.toISOString().slice(0, 10);
const endISO = sunday.toISOString().slice(0, 10);

const { rows: sites } = await c.query(
  "select id, code, name from sites where is_active=true order by code",
);
const { rows: shifts } = await c.query(
  `select s.id, s.date::text as d, s.start_time, s.end_time, s.break_minutes,
          s.is_overtime, s.overtime_multiplier, s.site_id, s.generation_note,
          e.full_name, si.code as site_code
   from shifts s
   join employees e on e.id = s.employee_id
   left join sites si on si.id = s.site_id
   where s.date between $1 and $2
   order by si.code, s.date, s.start_time`,
  [startISO, endISO],
);

const { rows: needs } = await c.query(
  `select site_id, day_of_week, start_time, end_time, headcount, is_critical
   from site_needs where is_enabled = true`,
);

function fmtHM(t) {
  return t.slice(0, 5);
}
function netHours(s) {
  const [sh, sm] = s.start_time.split(":").map(Number);
  const [eh, em] = s.end_time.split(":").map(Number);
  const gross = (eh * 60 + em - sh * 60 - sm) / 60;
  return Math.max(0, gross - (s.break_minutes ?? 0) / 60);
}

const DAY_LBL = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

const lines = [];
lines.push(`Salut Karim,`);
lines.push("");
lines.push(`Recap du planning actuel pour la semaine du ${startISO} au ${endISO}.`);
lines.push(`Total shifts : ${shifts.length}.`);
lines.push("");

// Par site
for (const site of sites) {
  const siteShifts = shifts.filter((s) => s.site_id === site.id);
  if (siteShifts.length === 0) {
    lines.push(`=== SITE ${site.code} ${site.name} — AUCUN SHIFT ===`);
    lines.push("");
    continue;
  }
  const totalH = siteShifts.reduce((a, s) => a + netHours(s), 0);
  const otH = siteShifts.filter((s) => s.is_overtime).reduce((a, s) => a + netHours(s), 0);
  lines.push(`=== SITE ${site.code} ${site.name} — ${siteShifts.length} shifts, ${totalH.toFixed(1)}h dont ${otH.toFixed(1)}h OT ===`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const dISO = d.toISOString().slice(0, 10);
    const dayShifts = siteShifts.filter((s) => s.d === dISO).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const dow = d.getDay();
    const dayNeeds = needs.filter((n) => n.site_id === site.id && n.day_of_week === dow);
    const reqHc = dayNeeds.reduce((a, n) => a + n.headcount, 0);
    const actHc = dayShifts.length;
    lines.push(`  ${DAY_LBL[dow]} ${dISO} — ${actHc}/${reqHc} besoin(s) couvert(s)`);
    if (dayShifts.length === 0 && reqHc > 0) {
      lines.push(`    ⚠ AUCUN SHIFT pour ce jour (${reqHc} besoins decouverts)`);
    }
    for (const s of dayShifts) {
      const tag = s.is_overtime ? ` OT x${s.overtime_multiplier ?? "?"}` : "";
      const noteShort = (s.generation_note ?? "")
        .replace(/Phase 1 contractuel · Site . · need ./, "")
        .replace(/Slot \d+:\d+-\d+:\d+ \([0-9.]+h\) · /, "")
        .slice(0, 100);
      lines.push(`    ${fmtHM(s.start_time)}-${fmtHM(s.end_time)} ${s.full_name}${tag}`);
      if (noteShort) lines.push(`        ${noteShort}`);
    }
  }
  lines.push("");
}

// Resume par employe
lines.push("=== HEURES PAR EMPLOYE (cette semaine) ===");
const byEmp = new Map();
for (const s of shifts) {
  const h = netHours(s);
  const ex = byEmp.get(s.full_name) ?? { contract: 0, ot: 0, sites: new Set() };
  if (s.is_overtime) ex.ot += h;
  else ex.contract += h;
  ex.sites.add(s.site_code);
  byEmp.set(s.full_name, ex);
}
const sorted = [...byEmp.entries()].sort();
for (const [name, info] of sorted) {
  const total = info.contract + info.ot;
  lines.push(`  ${name} : ${total.toFixed(1)}h (${info.contract.toFixed(1)}h contract + ${info.ot.toFixed(1)}h OT) — sites ${[...info.sites].sort().join(",")}`);
}
lines.push("");
lines.push("---");
lines.push("CaftanRH planning snapshot");

const body = lines.join("\n");

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("EmailJS env vars manquantes");
  console.log(body);
  await c.end();
  process.exit(1);
}

const subject = `CaftanRH — Planning semaine ${startISO} -> ${endISO} (${shifts.length} shifts)`;
const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({
    service_id: SERVICE_ID,
    template_id: TEMPLATE_ID,
    user_id: PUBLIC_KEY,
    template_params: {
      to_email: "elbazikarim@gmail.com",
      email: "elbazikarim@gmail.com",
      recipient: "elbazikarim@gmail.com",
      user_email: "elbazikarim@gmail.com",
      candidate_email: "elbazikarim@gmail.com",
      to: "elbazikarim@gmail.com",
      to_name: "Karim",
      name: "Karim",
      from_name: process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH",
      reply_to: process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com",
      subject,
      message: body,
      html_message: body.replace(/\n/g, "<br>"),
      body,
      html: body.replace(/\n/g, "<br>"),
      content: body,
    },
  }),
});
const text = await res.text();
console.log(`Mail status: ${res.status} | ${text}`);
console.log("\n=== EXTRAIT BACKUP (premieres 50 lignes) ===");
console.log(lines.slice(0, 50).join("\n"));
await c.end();
process.exit(res.ok ? 0 : 1);
