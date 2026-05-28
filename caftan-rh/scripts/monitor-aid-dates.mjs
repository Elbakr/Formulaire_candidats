// Cron quotidien : verifie les Aid (Fitr/Adha) a venir dans les 7 prochains
// jours et envoie un mail a Karim si la date n est pas encore "confirmee".
// Karim 20/05.

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

const todayISO = new Date().toISOString().slice(0, 10);
const limit = new Date();
limit.setDate(limit.getDate() + 14);
const limitISO = limit.toISOString().slice(0, 10);

// Charge les J de Fitr/Adha a venir dans 14 jours
const { rows } = await c.query(
  `select id, date::text as date_text, label, notes, staff_multiplier, shops_closed
   from holidays
   where (label ilike '%Aïd al-Fitr%' or label ilike '%Aïd al-Adha%')
     and shops_closed = true
     and is_active = true
     and date between $1 and $2
   order by date`,
  [todayISO, limitISO],
);

const pending = rows.filter((r) => {
  const n = (r.notes ?? "").toLowerCase();
  return !n.startsWith("confirme");
});

console.log(`Aid a venir dans 14j : ${rows.length}. Pendants (non confirmes) : ${pending.length}.`);

if (pending.length === 0) {
  console.log("✓ Tout confirme, pas de rappel a envoyer");
  await c.end();
  process.exit(0);
}

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("⚠ EmailJS env vars manquantes");
  await c.end();
  process.exit(1);
}

const TO_EMAIL = "elbazikarim@gmail.com";
const FROM_NAME = process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH";
const REPLY_TO = process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com";

const today = new Date(todayISO + "T12:00:00");

function daysUntil(dateText) {
  const d = new Date(dateText + "T12:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

const lines = [];
const subjects = [];
let urgent = false;

for (const aid of pending) {
  const dz = daysUntil(aid.date_text);
  const aidLabel = aid.label.includes("Fitr") ? "Aid El Saghir (al-Fitr)" : "Aid El Kabir (al-Adha)";
  if (dz <= 3) {
    urgent = true;
    subjects.push(`URGENT J-${dz} ${aidLabel}`);
  } else {
    subjects.push(`J-${dz} ${aidLabel}`);
  }
  lines.push(`== ${aidLabel} ==`);
  lines.push(`  Date actuellement prevue : ${aid.date_text} (dans ${dz} jour${dz > 1 ? "s" : ""})`);
  lines.push(`  Statut : ${aid.notes ?? "PROVISOIRE — non confirme"}`);
  lines.push(`  Action requise :`);
  lines.push(`    1) Verifie l annonce officielle (TheMWL, autorites religieuses)`);
  lines.push(`    2) Va sur https://caftanrh.loca.lt/admin/settings/aid-dates`);
  lines.push(`    3) Clique \"Confirmer cette date\" OU \"Avancer/Reculer d 1 jour\"`);
  lines.push("");
}

const subject = `CaftanRH — Rappel Aid : ${subjects.join(" | ")}`;
const body = [
  "Salut Karim,",
  "",
  urgent
    ? "⚠ URGENT — un ou plusieurs Aid sont dans moins de 4 jours et la date n est pas encore confirmee."
    : "Rappel : un ou plusieurs Aid approchent et leur date n est pas encore confirmee.",
  "",
  ...lines,
  "Si tu ne fais rien, le solver utilisera la date provisoire (estimee astronomiquement). Si l annonce officielle decale d 1 jour, les shifts crees a J seront a re-decaler manuellement.",
  "",
  "---",
  "CaftanRH Aid monitor (cron quotidien)",
].join("\n");

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

await c.end();
if (!res.ok) {
  console.log("\n--- CONTENU MAIL (backup, copier-coller manuel si echec API) ---");
  console.log("TO:", TO_EMAIL);
  console.log("SUBJECT:", subject);
  console.log("BODY:");
  console.log(body);
  process.exit(1);
}
process.exit(0);
