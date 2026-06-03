#!/usr/bin/env node
// Karim 2026-06-02 : mail recap auto lance par tunnel-keeper.ps1 a chaque
// rotation quotidienne (08:00). Lit l'URL actuelle dans TUNNEL_URL.txt +
// l'URL precedente dans env vars TUNNEL_URL_NEW / TUNNEL_URL_OLD.
//
// Invocation directe : cd caftan-rh && node scripts/send-tunnel-daily-recap.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE || !TEMPLATE || !KEY) {
  console.error("[X] EmailJS env missing");
  process.exit(1);
}

let newUrl = (process.env.TUNNEL_URL_NEW ?? "").trim();
let oldUrl = (process.env.TUNNEL_URL_OLD ?? "").trim();

const tunnelFile = resolve(__dirname, "../TUNNEL_URL.txt");
if (!newUrl && existsSync(tunnelFile)) {
  const m = readFileSync(tunnelFile, "utf8").match(/https?:\/\/[^\s]+/);
  if (m) newUrl = m[0];
}
if (!newUrl) {
  console.error("[X] no current tunnel URL found");
  process.exit(1);
}

// Karim 2026-06-03 : ajout destinataire Kamal en NL avec deep link.
// Karim recoit la version FR sur elbazikarim@gmail.com,
// Kamal recoit une version NL sur kamal@elbazi.com avec ${newUrl}/lang/nl?to=/me.
const TO = "elbazikarim@gmail.com";
const TO_NL = "kamal@elbazi.com";
const today = new Date();
const dateFR = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
const subject = `CaftanRH — Nouveau tunnel matinal ${dateFR}`;
const subjectNL = `CaftanRH — Nieuwe tunnel ${dateFR}`;

const oldLine = oldUrl ? `Ancien (mort) : ${oldUrl}\n` : "";
const oldLineNL = oldUrl ? `Oude (dood) : ${oldUrl}\n` : "";

const body = `Bonjour Karim,

═══════════════════════════════════════════════════
NOUVEAU TUNNEL DU JOUR — ${dateFR}
═══════════════════════════════════════════════════

URL active maintenant :
👉 ${newUrl}

${oldLine}
Tous les liens des mails envoyés aujourd'hui pointent automatiquement
sur ce nouveau tunnel (helper getPublicBaseUrl + .env.local sync).

═══════════════════════════════════════════════════
LIENS DIRECTS À BOOKMARKER iPhone
═══════════════════════════════════════════════════

🔗 Login                : ${newUrl}/login
📱 Dashboard mobile     : ${newUrl}/m
📅 Planning semaine     : ${newUrl}/planning/calendar
👥 Employés             : ${newUrl}/planning/employees
💰 Fiches de paie       : ${newUrl}/admin/payslips
📨 Mails sortants       : ${newUrl}/rh/mails
✍️ Ruptures amiables    : ${newUrl}/rh/terminations
❓ FAQ / Aide           : ${newUrl}/faq

═══════════════════════════════════════════════════
BOOKMARK STABLE (toujours à jour)
═══════════════════════════════════════════════════

Si tu veux UN seul lien à bookmarker qui ne change jamais :
👉 https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt

(ce fichier est commit/push automatiquement par tunnel-keeper à chaque rotation)

Bonne journée,
— CaftanRH (envoi auto par tunnel-keeper.ps1)
`;

const bodyNL = `Hallo Kamal,

═══════════════════════════════════════════════════
NIEUWE TUNNEL VAN DE DAG — ${dateFR}
═══════════════════════════════════════════════════

Actieve URL nu :
👉 ${newUrl}

Direct in NL inloggen (cookie lang=nl):
👉 ${newUrl}/lang/nl?to=/me

${oldLineNL}
Alle links in mails verzonden vandaag wijzen automatisch
naar deze nieuwe tunnel.

═══════════════════════════════════════════════════
DIRECTE LINKS — bookmark op iPhone
═══════════════════════════════════════════════════

🔗 Login              : ${newUrl}/login
📱 Mobile dashboard   : ${newUrl}/m
📅 Week planning      : ${newUrl}/planning/calendar
👥 Werknemers         : ${newUrl}/planning/employees
💰 Loonfiches         : ${newUrl}/admin/payslips
📨 Uitgaande mails    : ${newUrl}/rh/mails
✍️  Beeindigingen     : ${newUrl}/rh/terminations
❓ FAQ / Hulp          : ${newUrl}/faq

═══════════════════════════════════════════════════
STABIELE BOOKMARK (altijd up-to-date)
═══════════════════════════════════════════════════

Eén link om te bookmarken die nooit verandert :
👉 https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt

Fijne dag,
— CaftanRH (automatisch dagelijks via tunnel-keeper.ps1)
`;

async function sendMail(to, name, subj, content) {
  const params = {
    to_email: to, email: to, user_email: to, candidate_email: to,
    to, to_name: name, name, candidate_name: name,
    from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
    subject: subj, message: content, html_message: content.replace(/\n/g, "<br>"),
    body: content, content, html: content.replace(/\n/g, "<br>"),
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
  });
  return res;
}

console.log("Envoi du recap matinal vers", TO, "(FR)...");
const res = await sendMail(TO, "Karim Elbazi", subject, body);
console.log("FR Karim Status:", res.status);
if (!res.ok) {
  console.error("EmailJS err FR:", await res.text());
}

console.log("Envoi du recap matinal vers", TO_NL, "(NL)...");
const resNL = await sendMail(TO_NL, "Kamal Elbazi", subjectNL, bodyNL);
console.log("NL Kamal Status:", resNL.status);
if (!resNL.ok) {
  console.error("EmailJS err NL:", await resNL.text());
}

if (!res.ok && !resNL.ok) process.exit(1);
console.log("✓ Mails recap envoyés");
