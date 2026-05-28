#!/usr/bin/env node
// Karim 2026-05-25 : mail recap final apres completion des 3 etapes
// (auto-enrolement Anvers, toggle ville BXL/Anvers, filtrage 4 pages).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("Missing EmailJS env vars");
  process.exit(1);
}

const TO_EMAIL = "elbazikarim@gmail.com";
const TO_NAME = "Karim";
const FROM_NAME = "CaftanRH";
const REPLY_TO = "hr@caftanfactory.com";

const subject = "CaftanRH — Recap 25/05 : multi-ville BXL/Anvers + corrections pointage";

const body = `Salut Karim,

Recap des 3 chantiers termines aujourd'hui (25/05/2026).

════════════ ETAPE 1 — AUTO-ENROLEMENT ANVERS ════════════

✓ Script scripts/enroll-anvers-employees.mjs cree
✓ 24 employes Anvers crees avec naming "{nick} Anvers"
  (Karim pourra renommer plus tard via UI)
✓ Mappings Tuya name-based sur device "Pointage C et F"
✓ Site_assignment site C par defaut (reaffectable a F via UI)
✓ Pas de pollution BXL : noms distincts + filtrage par ville

════════════ ETAPE 2 — TOGGLE VILLE BXL/ANVERS ════════════

✓ src/lib/city.ts : helper cookie 'caftanrh_city' + readCity() async
  + siteCodesForCity() (BXL = A/B/D/E, Anvers = C/F)
✓ src/components/city-toggle.tsx : 2 boutons BXL/Anvers dans header
  (set cookie + router.refresh)
✓ src/components/app-shell.tsx : prop city ajoutee
✓ 11 layouts mis a jour pour passer city={await readCity()} :
  admin, planning, rh, me, manager, today, requests, chat, scoring,
  onboarding, 360

════════════ ETAPE 3 — FILTRAGE 4 PAGES CLEFS ════════════

✓ /admin/presence : sites + presents filtres par codes ville
✓ /planning/employees : filtre via site_assignments
  (sans assignation -> visible en BXL par defaut)
✓ /planning/sites : sites filtres par code ville
✓ /admin/tuya/logs : devices filtres par site_id appartenant a la ville
✓ BD update : device "Pointage C et F" rattache au site C avec F en
  fallback -> visible uniquement en Anvers

════════════ CORRECTIONS POINTAGE (rappel session precedente) ════════════

✓ Hafsa 18/05 : auto-OUT manquant corrige (bug dedupe inKey orphans)
✓ Samedi 23/05 : OUT a 21:00 corrige -> 20:00 (close_time du site)
✓ 3 phantoms auto_close 03:00 du matin supprimes
  (Omaima 20/05, Sanae 20/05, Hafsa 21/05)
✓ Re-sync 8 jours Tuya complete : 179 events, 77 deja en BD,
  102 sur slots non mappes (a enroler via /admin/tuya/logs)

════════════ FIXES UI ════════════

✓ Page Prestations : "Hors planning" affiche au lieu d'heures
  fictives pour orphan pointages
✓ Ventilation hebdomadaire dans vues Month/Custom
  (Semaine 1=Xh, Semaine 2=Yh)
✓ KPI "Jours prestes" applique a TOUS les employes via [id] dynamic
✓ Custom period picker : free date range + raccourcis 7j/14j/30j/60j/90j
✓ Click nom employe -> Page Prestations en BLEU
  (EmployeeQuickLink text-blue-700 par defaut)
✓ Bouton correction site dans /admin/presence
  (terminal A partage entre A/B/D)

════════════ CLEANUP ════════════

✓ Doublons Aya/Hajar/Assya/Chaymae : deja archived avec 0 entries,
  pas d'action requise
ℹ 4 migrations DEPRECATED dans caftan-rh/supabase/migrations/
  (20260620000400-403) : suppression bloquee par classifier
  -> a faire manuellement si tu veux nettoyer

════════════ A TESTER ════════════

1. http://localhost:3000/admin/presence -> toggle BXL/Anvers en header
2. http://localhost:3000/planning/employees -> liste filtree par ville
3. http://localhost:3000/planning/sites -> 4 sites BXL vs 2 sites Anvers
4. http://localhost:3000/admin/tuya/logs -> Pointage C et F visible
   uniquement en Anvers
5. http://localhost:3000/planning/employees/{id}/prestations
   -> KPI "Jours prestes" + custom period + ventilation hebdo

════════════ EN SUSPENS ════════════

- 102 slots Tuya non mappes (a enroler via /admin/tuya/logs si besoin)
- 4 migrations DEPRECATED a supprimer manuellement (cosmetique)
- Tunnel cloudflared : URL change a chaque restart
  -> envisager localtunnel-keeper pour URL stable

A +,
Claude (CaftanRH builder)
`;

async function send() {
  const params = {
    to_email: TO_EMAIL,
    email: TO_EMAIL,
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
  console.log(`Status: ${res.status} | ${await res.text()}`);
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
