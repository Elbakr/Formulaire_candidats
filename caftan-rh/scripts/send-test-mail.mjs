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

const TUNNEL_URL = "https://estates-soma-generous-competing.trycloudflare.com";
const LAN_URL = "http://192.168.129.81:3000";

const subject = "CaftanRH — Nouvelle URL HTTP2 (push iOS)";

const body = `Salut Karim,

Nouvelle URL du tunnel CaftanRH (mode HTTP2 pour mieux supporter le push iOS).

═════════ ACCÈS TEST iPhone (HTTPS) ═════════
URL : ${TUNNEL_URL}/login

HTTPS = géoloc strict, selfie clock-in, push notifs, install PWA fonctionnent.

Test LAN même Wi-Fi (HTTP, sans push) :
${LAN_URL}/login

═════════ COMPTES DE TEST ═════════

ADMIN (toi)
  Email : elbazikarim@gmail.com
  Pwd   : Admin2026!

EMPLOYÉ démo
  Email : demo-employee@caftanfactory.local
  Pwd   : Employe2026!

CANDIDAT démo
  Email : demo-candidate@caftanfactory.local
  Pwd   : Candidat2026!

═════════ NOUVEAUTÉS DU 12 MAI (20 commits) ═════════

  CRÉNEAUX & POLITIQUE MAGASINS
  • site_needs.is_critical : 84 nouveaux besoins créés (14:30-17:30
    ultra-critique + 12:30-18:30 critique sur tous les sites)
  • site_needs.is_enabled : toggle on/off par créneau, solver ignore les
    éteints sans avoir à les supprimer
  • holidays.shops_closed : politique Caftan -- AUCUN magasin ne ferme jamais
    sauf le J de chaque Aïd (4j/an au total)
  • Aïd J-1 ouvert avec rush ×1.5, ×2.0 si coïncidence autre férié
    (cas 2026-05-25 J-1 Aïd Adha + Lundi Pentecôte = ×2.0)
  • Date Ascension corrigée : 2026-05-14 (jeudi) au lieu de 2026-05-13
  • Site E adresse : Chaussée de Gand, 1080 Molenbeek-Saint-Jean

  PLANNING & SHIFT
  • 3 vues fiche employé : Global / Contractuel / Heures sup. + édition CRUD
  • Site code+couleur visible sur chaque cellule de planning
  • ShiftDialog : créneaux suggérés du site + snap d'alignement 30 min
  • ShiftDialog : warning souple si shift chevauche une indispo déclarée
  • Garde anti-OT-prématurée (upsertShiftAction + commitIndividualOvertimeAction)
  • OT méritocratique : seul employees.ot_eligible apparaît dans le sélecteur
  • Chevauchements totalement autorisés (créneau critique dans contractuel)
  • Auto-planning multi-sites en 1 clic : "Générer la semaine" → dialog avec
    sites cochables (préférence mémorisée localStorage) → preview → "Tout
    valider" → bouton "⮌ Annuler la dernière génération" visible 24h

  PRÉSENCE & GÉOLOC
  • Voyant présence enrichi avec chip code site (qui est où en temps réel)
  • Dashboard admin : carte "Présence en direct" groupée par site
  • /admin/presence : carte Leaflet (OpenStreetMap) temps réel avec pins
    sites + cercles géofence + pins employés (rouge clignotant si hors zone)

  NOTIFICATIONS
  • VAPID push keys générées et configurées
  • Banner d'activation push proactif dans le layout (visible toutes pages)
  • Sur iOS hors PWA : guide d'installation (Partager → Sur écran d'accueil)
  • Cron special-day-preview : 7j avant un Aïd/jour spécial, push aux
    employés OFF habituels "Tu es présumé disponible, on compte sur toi"
  • Test local OK : 1 holiday Ascension détectée, 2 employés OFF, 2 notifs

  ADMIN
  • /admin/holidays éditable : toggle "Magasin fermé" + slider effectif
    ×1.0-4.0 par férié (plus besoin de scripts SQL)
  • /admin/settings restructuré : section "Rubriques liées" qui pointe vers
    /planning/sites, /admin/holidays, /admin/seasonal
  • /admin/analytics : bandeau "Alertes prioritaires" + table "Besoins par
    site" avec écart contractuel/OT par site

  CORRECTIONS
  • Proxy bypass /api/cron et /api/push (Vercel Cron passe sans cookie)
  • Bug Hidaya : shift OT injustifié supprimé + garde anti-OT-prématurée
  • Solver boost senior sur weekend, jeudi @ site E, jour spécial, critique

═════════ ACTION REQUISE DE TON CÔTÉ ═════════

1. Coche ot_eligible sur les employés méritants via
   /planning/employees/{id} → "Éligible aux heures supplémentaires".
   Sans ça, personne ne peut être proposé en OT case-par-case.

2. Sur iPhone : installe l'app via Partager → "Sur l'écran d'accueil"
   PUIS rouvre depuis l'icône → tu verras le banner pour activer les push.

3. Régénère le planning site A (Générer la semaine → cocher A) →
   le jeudi 14/05 (Ascension) doit maintenant être couvert.

═════════ REPO GITHUB ═════════

Branche : caftan-rh-v2-prod (push automatique à chaque commit)
URL : https://github.com/Elbakr/Formulaire_candidats/tree/caftan-rh-v2-prod

═════════ CRÉDIT CLAUDE CONSOMMÉ (estimation) ═════════

08/05 : démarrage refonte, ~400 k tokens (~6 €)
09/05 : GestiPlanning + Chat + Pointage, ~3,5 M tokens (~50 €)
10/05 : Modules 2-5 + i18n + stratégie, ~4,8 M tokens (~70 €)
11/05 : Pré-entretien V2 + audit + créneaux critiques, ~3,5 M tokens (~52 €)
12/05 : Aïd policy + analytics + push + carte géoloc + auto-planning
        multi-sites + holidays UI + rollback, ~4,5 M tokens (~68 €)

Total ~16,7 M tokens, ~245 € sur 5 jours.
Équivalent humain : 70-100 jours-dev senior = 42-60 k€.

═════════ STATS PLATEFORME ═════════

- ~35 migrations DB appliquées en production
- ~125 routes Next.js
- ~42 tables Postgres avec RLS strict
- 15 cron jobs (dont special-day-preview tout neuf)
- Bilingue FR/NL (~320 clés)
- Conformité Belgique (NRN, IBAN, CDD, Dimona) + RGPD
- 100+ chantiers fonctionnels distincts depuis le début

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
