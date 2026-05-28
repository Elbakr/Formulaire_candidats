// Surveillance : detecte les shifts cross-site dont l employe n a pas d
// affectation correspondante. Envoie un mail a Karim si detecte.
// Karim 20/05 : cron quotidien pour eviter le retour des incoherences.
//
// USAGE :
//   node scripts/monitor-shift-coherence.mjs       # check + mail si KO
//   node scripts/monitor-shift-coherence.mjs --autofix  # check + auto-fix +
//                                                       mail si encore KO

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const AUTOFIX = process.argv.includes("--autofix");

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const today = new Date();
const future = new Date(today);
future.setDate(future.getDate() + 60);
const startISO = today.toISOString().slice(0, 10);
const endISO = future.toISOString().slice(0, 10);

async function checkMismatches() {
  const { rows } = await c.query(
    `select s.id, s.employee_id, s.date::text as date_text,
            s.start_time, s.end_time, s.site_id,
            si.code as shift_site_code,
            e.full_name
     from shifts s
     join employees e on e.id = s.employee_id
     left join sites si on si.id = s.site_id
     where s.date between $1 and $2
       and e.status = 'active'
     order by e.full_name, s.date`,
    [startISO, endISO],
  );
  const { rows: assigns } = await c.query(
    `select sa.employee_id, sa.site_id,
            sa.start_date::text as start_text,
            sa.end_date::text as end_text,
            si.code as code
     from site_assignments sa
     join sites si on si.id = sa.site_id`,
  );
  const issues = [];
  const noSite = [];
  for (const s of rows) {
    if (s.site_id == null) {
      noSite.push(s);
      continue;
    }
    const active = assigns.filter(
      (a) =>
        a.employee_id === s.employee_id &&
        a.start_text <= s.date_text &&
        (a.end_text == null || a.end_text >= s.date_text),
    );
    if (active.length === 0 || !active.some((a) => a.site_id === s.site_id)) {
      issues.push({
        ...s,
        active_codes: active.map((a) => a.code),
      });
    }
  }
  return { issues, noSite, total: rows.length };
}

let result = await checkMismatches();
let action = "check only";

if (AUTOFIX && (result.issues.length > 0 || result.noSite.length > 0)) {
  action = "autofix tente";
  // Run le fix
  const { spawnSync } = await import("node:child_process");
  const fix = spawnSync(
    "node",
    [resolve(__dirname, "fix-cross-site-assignments.mjs"), "--apply"],
    { stdio: "inherit" },
  );
  if (fix.status !== 0) {
    action = "autofix echec";
  } else {
    action = "autofix applique";
    result = await checkMismatches();
  }
}

console.log(
  `Coherence check : ${result.issues.length} mismatch(es), ${result.noSite.length} sans site_id, total=${result.total}, action=${action}`,
);

await c.end();

if (result.issues.length === 0 && result.noSite.length === 0) {
  console.log("✓ Tout est coherent");
  process.exit(0);
}

// Envoi mail si echec
const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("⚠ EmailJS env vars manquantes — alerte loggue mais pas mailee.");
  process.exit(1);
}

const TO_EMAIL = "elbazikarim@gmail.com";
const FROM_NAME = process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH";
const REPLY_TO = process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com";

const subject = `CaftanRH ⚠ Incoherences planning detectees (${result.issues.length + result.noSite.length})`;

const byEmp = new Map();
for (const i of result.issues) {
  const arr = byEmp.get(i.full_name) ?? [];
  arr.push(i);
  byEmp.set(i.full_name, arr);
}

const lines = [];
lines.push("Salut Karim,");
lines.push("");
lines.push(`Le check quotidien de coherence du planning a trouve ${result.issues.length} shift(s) avec un site_id qui ne correspond a aucune affectation officielle de l employe, et ${result.noSite.length} shift(s) sans site_id.`);
lines.push("");
lines.push(`Action tentee : ${action}`);
lines.push(`Fenetre : ${startISO} -> ${endISO}`);
lines.push("");

if (result.issues.length > 0) {
  lines.push("== Mismatches site_id vs affectations ==");
  for (const [name, list] of [...byEmp.entries()].sort()) {
    lines.push(`  ${name} (${list.length} shift${list.length > 1 ? "s" : ""}):`);
    for (const s of list) {
      lines.push(
        `    ${s.date_text} ${s.start_time.slice(0, 5)} | shift=${s.shift_site_code} | affectations=[${s.active_codes.join(",") || "AUCUNE"}]`,
      );
    }
  }
  lines.push("");
}

if (result.noSite.length > 0) {
  lines.push("== Shifts sans site_id ==");
  for (const s of result.noSite) {
    lines.push(
      `  ${s.date_text} ${s.start_time.slice(0, 5)} | ${s.full_name}`,
    );
  }
  lines.push("");
}

lines.push("Pour reparer immediatement :");
lines.push("  cd caftan-rh && node scripts/fix-cross-site-assignments.mjs --apply");
lines.push("");
lines.push("Cause probable : le solver site a pioche un employe en renfort cross-site (tier 3) sans creer le site_assignment correspondant. C est legitime mais il faut officialiser apres coup.");
lines.push("");
lines.push("---");
lines.push("CaftanRH coherence monitor");

const body = lines.join("\n");

const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({
    service_id: SERVICE_ID,
    template_id: TEMPLATE_ID,
    user_id: PUBLIC_KEY,
    template_params: {
      to_email: TO_EMAIL,
      email: TO_EMAIL,
      recipient: TO_EMAIL,
      user_email: TO_EMAIL,
      candidate_email: TO_EMAIL,
      to: TO_EMAIL,
      to_name: "Karim",
      name: "Karim",
      from_name: FROM_NAME,
      reply_to: REPLY_TO,
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
if (!res.ok) {
  console.log("\n--- CONTENU MAIL (backup, copier-coller manuel si echec API) ---");
  console.log(body);
  process.exit(1);
}
process.exit(0);
