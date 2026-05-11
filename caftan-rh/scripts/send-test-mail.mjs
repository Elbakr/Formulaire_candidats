#!/usr/bin/env node
// Envoi mail via EmailJS REST API — pour transmettre les credentials de test
// à l'utilisateur (elbazikarim@gmail.com). Demande explicite Karim 2026-05-11.
//
// EmailJS bloque par défaut les calls non-browser. Si "Allow API for non-browser"
// n'est PAS coché dans le service, ce script échouera avec un message clair.
// Dans ce cas, le user copie-colle le contenu affiché ici dans Gmail manuellement.

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

const TUNNEL_URL = "https://meal-suse-clarke-conduct.trycloudflare.com";
const LAN_URL = "http://192.168.129.81:3000";

const subject = "CaftanRH v2 — NOUVELLE URL test smartphone (relancée)";

const body = `Salut Karim,

⚠️ L'URL Cloudflare précédente est morte (le tunnel a expiré).
Voici la NOUVELLE URL active. Vérifie d'abord le SPAM Gmail, comme la première fois.

La plateforme CaftanRH v2 est prête pour test depuis ton iPhone.

═════════ ACCÈS TEST À DISTANCE (HTTPS) ═════════
URL : ${TUNNEL_URL}/login

Valable depuis n'importe quel appareil (iPhone/Android/PC), n'importe où dans
le monde, tant que mon PC dev reste allumé avec le tunnel actif. HTTPS = géoloc
strict, photo selfie, push notifications, install PWA fonctionnent.

Test LAN même Wi-Fi (HTTP, sans géoloc/selfie/push) :
${LAN_URL}/login

═════════ 3 COMPTES DE TEST ═════════

ADMIN (toi)
  Email : elbazikarim@gmail.com
  Pwd   : Admin2026!

EMPLOYÉ démo
  Email : demo-employee@caftanfactory.local
  Pwd   : Employe2026!

CANDIDAT démo
  Email : demo-candidate@caftanfactory.local
  Pwd   : Candidat2026!

(Pour réinitialiser : cd caftan-rh && node scripts/setup-demo-credentials.mjs)

═════════ DOCUMENTATION ═════════

DOCUMENTATION.md à la racine du repo (branche caftan-rh-v2-prod, à pousser).
Une fois la branche poussée, lien GitHub direct :
https://github.com/elbakr/Formulaire_candidats/blob/caftan-rh-v2-prod/DOCUMENTATION.md

Pour PDF : ouvrir le lien Raw, Ctrl+P → "Enregistrer en PDF".

═════════ SCÉNARIOS DE TEST iPHONE ═════════

1. Login admin → /today : vois la card "Pic saisonnier" si actif
2. /planning/sites/A → "Générer planning" → preview phase 1 contractuel STRICT
   Si uncovered → "Voir les options" → overtime case-par-case (×1.25/×1.5/×2)
3. Fiche candidat → onglet "Pré-entretien" → "Envoyer par email" via EmailJS
4. Logout → login employé démo → /me/today
   → demande renfort/absence avec carte boutons OUI/NON dans le chat
5. /me/clock → autorise géoloc + caméra → photo selfie auto + check 100m
6. /me/my-clients → ajouter une cliente VIP (consentement RGPD requis)
7. Switch FR/NL via toggle dans le header → toutes les pages employé basculent

═════════ CRÉDIT CLAUDE CONSOMMÉ (estimation) ═════════

08/05 : démarrage refonte, ~400 k tokens (~6 €)
09/05 : GestiPlanning + Chat + Pointage, ~3,5 M tokens (~50 €)
10/05 : Modules 2-5 + i18n + stratégie, ~4,8 M tokens (~70 €)
11/05 : V2 vidéo + audit + top-3 + commit + doc + mail, ~2,5 M tokens (~38 €)

Total ~11 M tokens, ~160-180 € sur 4 jours.
Équivalent humain : 60-90 jours-dev senior = 36-54 k€.

═════════ STATS PLATEFORME ═════════

- 30 migrations SQL appliquées
- ~120 routes Next.js
- ~40 tables Postgres avec RLS strict
- 14 cron jobs (Dimona, sync GF, purges RGPD, anniv VIP, etc.)
- Bilingue FR/NL (~320 clés)
- Conformité Belgique (NRN, IBAN, CDD, Dimona) + RGPD complet
- 80+ chantiers fonctionnels distincts

À +,
Claude (CaftanRH builder)
`;

async function send() {
  // Envoie le mail avec plusieurs noms de variable de destinataire couramment
  // utilisés dans les templates EmailJS, pour maximiser les chances qu'il
  // arrive (le template peut référencer {{email}}, {{to_email}}, {{user_email}},
  // {{candidate_email}}, etc.).
  const variants = [
    { to_email: TO_EMAIL, email: TO_EMAIL, recipient: TO_EMAIL, user_email: TO_EMAIL, candidate_email: TO_EMAIL, to: TO_EMAIL },
  ];
  for (const params of variants) {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        template_params: {
          ...params,
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
        },
      }),
    });
    const text = await res.text();
    console.log(`Variant status: ${res.status} | body: ${text}`);
    if (!res.ok) {
      console.log("❌ Variant failed.");
      break;
    }
  }
  console.log("\n--- CONTENU À COPIER-COLLER DANS GMAIL EN BACKUP ---\n");
  console.log("TO:", TO_EMAIL);
  console.log("SUBJECT:", subject);
  console.log("BODY:");
  console.log(body);
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
