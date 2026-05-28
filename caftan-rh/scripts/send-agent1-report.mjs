#!/usr/bin/env node
// Karim 2026-05-24 : envoi rapport Agent 1 (Tuya Pointage A enrolment).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("Missing EmailJS env vars in .env.local");
  process.exit(1);
}

const TO_EMAIL = "elbazikarim@gmail.com";
const TO_NAME = "Karim";
const FROM_NAME = process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH";
const REPLY_TO = process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com";

const subject = "CaftanRH — Agent 1 (Tuya Pointage A) : terminé";

const body = `Salut Karim,

Agent 1 (enrolement Tuya Pointage A) est terminé. Récap clair :

═════════ ACTIONS EFFECTUÉES ═════════

1. MIGRATION 406 — FIXÉE ET APPLIQUÉE
   • Cause du fail initial : ON CONFLICT (email) sur employees alors qu il
     n y avait PAS de unique constraint sur cette colonne (et pareil pour
     site_assignments). Le PG planner refuse ON CONFLICT s il ne trouve
     pas l index/contrainte exacte.
   • Réécriture : remplacé les ON CONFLICT par WHERE NOT EXISTS pour
     employees et site_assignments. Pour tuya_user_mapping, drop explicite
     de l ancienne contrainte (tuya_user_id, direction) puis ADD CONSTRAINT
     explicite de la nouvelle (tuya_device_id, employee_id, direction).
   • Migration appliquée : OK.

2. 4 NOUVEAUX EMPLOYEES CRÉÉS (Site A) :
   • Aya         (tuya-aya@local.caftanrh)
   • Hajar       (tuya-hajar@local.caftanrh)
   • Assya       (tuya-assya@local.caftanrh)
   • Chaymae     (tuya-chaymae@local.caftanrh)
   Tous avec site_assignment Site A (is_primary=true).
   → Va éditer leur fiche /planning/employees/[id] pour ajuster job_title,
     téléphone, IBAN, NRN, adresse, contrat réel (CDI/CDD/intérim), etc.

3. 14 MAPPINGS TUYA_USER_MAPPING POUR POINTAGE A :
   alpha=4hnqyu  "Omaima"   -> Omaima Ouahi
   alpha=4rh3ki  "Saliima"  -> Salima Alaoui
   alpha=4rh542  "Chaymae"  -> Chaymae (nouveau)
   alpha=4rmzdi  "Lina"     -> El Bertitan Lina (1ere empreinte)
   alpha=4rmzga  "Ilham"    -> Ilham Serghini
   alpha=4rnsji  "Ibtissam" -> Ibtissem Benoukhita
   alpha=4rpii2  "Hafsa"    -> Hafsa Imachaal
   alpha=4rptm2  "Assya"    -> Assya (nouveau)
   alpha=4tcpwm  "Selma"    -> Selma Maïssa
   alpha=4thiqu  "hajar"    -> Hajar (nouveau)
   alpha=4tjrau  "aya"      -> Aya (nouveau)
   alpha=4vfdmy  "lina 2"   -> El Bertitan Lina (2eme empreinte, direction=out)
   alpha=4xydby  "sanae IL" -> Sanae Asaidi
   alpha=4zeydy  "doha"     -> Rekimi Doha

   Note : 3 anciens mappings OUT (Omaima, Sanae, Hafsa) avec slot numerique
   (50, 112, 94) sont conservés intacts — ils continuent de fonctionner.

4. BACKFILL 7 JOURS DÉCLENCHÉ :
   • devices_polled    : 3 (Pointage A, Pointage E, + 1 autre)
   • logs_fetched      : 128
   • entries_inserted  : 12 clock_entries source='tuya'
   • skipped_no_mapping: 84 (slots locaux pas encore mappés sur les
     empreintes nouvellement enrolées de Pointage A)
   • skipped_duplicate : 0
   • errors            : 32 (toutes des erreurs "Un clock-in est déjà ouvert"
     ou "Aucun clock-in à fermer" — c est le trigger d intégrité de
     clock_entries qui rejette les doublons, ce n est PAS un fail Tuya).

5. AMÉLIORATION src/lib/tuya-poll.ts :
   • Le code charge maintenant tuya_user_id_alpha en plus de tuya_user_id.
   • Quand un event arrive avec un slot N inconnu mais que le device a des
     mappings alpha-only en attente, un warning explicite est loggué :
     "Slot N non resolu sur Pointage A (X mappings alpha-only en attente).
     Karim doit mapper via /admin/tuya/logs."
   • Skip silencieux (compté dans skipped_no_mapping).

═════════ ACTION RESTANTE POUR TOI ═════════

Le slot local Tuya (entier ex 109) qui apparait dans les unlock events
n est PAS récupérable depuis l API Tuya à partir du user_id alphanumérique
(ex "4hnqyu"). Tuya n expose pas cette correspondance par API. Donc :

→ Va sur /admin/tuya/logs
→ Pour chaque event "Slot N non mappé" sur Pointage A :
  - L UI te montrera l heure de l event et le slot N
  - Tu choisis quel employé pointe à ce moment (l UI te propose les 14
    pré-enrolés par alpha)
  - Au clic, le mapping est complété (tuya_user_id = N rempli sur la
    bonne ligne).
→ 1 clic par employé. À chaque clic, les pointages futurs du même slot
  s alimentent automatiquement dans clock_entries.

Une fois les 14 slots renseignés, l alternance auto IN/OUT
(chronologique) prendra le relais : aucun risque d empreinte mal mappée.

═════════ FICHIERS TOUCHÉS ═════════

• supabase/migrations/20260620000406_tuya_pointage_a_enroll.sql (réécrit)
• caftan-rh/src/lib/tuya-poll.ts (résolution slot↔alpha + log explicite)
• caftan-rh/scripts/diag-pointage-a-enroll.mjs (nouveau, diagnostic)
• caftan-rh/scripts/send-agent1-report.mjs (ce mail)

À +,
Agent 1 (Claude / CaftanRH builder)
`;

async function send() {
  const params = {
    to_email: TO_EMAIL,
    email: TO_EMAIL,
    recipient: TO_EMAIL,
    user_email: TO_EMAIL,
    candidate_email: TO_EMAIL,
    to: TO_EMAIL,
    to_name: TO_NAME,
    name: TO_NAME,
    candidate_name: TO_NAME,
    from_name: FROM_NAME,
    reply_to: REPLY_TO,
    subject,
    message: body,
    html_message: body.replace(/\n/g, "<br>"),
    body,
    html: body.replace(/\n/g, "<br>"),
    content: body,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: params,
    }),
  });
  const text = await res.text();
  console.log(`EmailJS status: ${res.status} | body: ${text}`);
  if (!res.ok) {
    console.log("\n--- CONTENU À COPIER-COLLER DANS GMAIL EN BACKUP ---\n");
    console.log("TO:", TO_EMAIL);
    console.log("SUBJECT:", subject);
    console.log("BODY:");
    console.log(body);
    process.exit(1);
  }
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
