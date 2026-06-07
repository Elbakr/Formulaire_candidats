#!/usr/bin/env node
// Karim 2026-05-31 : recap mail complet — URLs, login, app overview, roadmap.
// Lance manuellement : cd caftan-rh && node scripts/send-recap-app-overview.mjs

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
  console.error("[X] Missing EmailJS env vars in .env.local");
  process.exit(1);
}

// 1. Tunnel URL courant
let tunnel = "https://past-seekers-creature-behavioral.trycloudflare.com";
const tunnelFile = resolve(__dirname, "../TUNNEL_URL.txt");
if (existsSync(tunnelFile)) {
  const raw = readFileSync(tunnelFile, "utf8");
  const m = raw.match(/https?:\/\/[^\s]+/);
  if (m) tunnel = m[0];
}

const TO_EMAIL = "elbazikarim@gmail.com";
const LOCAL = "http://localhost:3000";
const LAN = "http://192.168.129.81:3000";
const STABLE = "https://caftanrh.loca.lt";
const BOOKMARK_URL = "https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt";
const GITHUB = "https://github.com/Elbakr/Formulaire_candidats/tree/caftan-rh-v2-prod";

const subject = "CaftanRH — Recap app complete + URLs + login + roadmap";

const body = `Salut Karim,

Voici le recap complet a date 2026-05-31 :

═══════════════════════════════════════════════════════
1. URLS D ACCES (a bookmarker sur iPhone)
═══════════════════════════════════════════════════════

🌐 Tunnel cloudflared (actif maintenant) :
   ${tunnel}

🔗 Tunnel localtunnel stable (alternative) :
   ${STABLE}

📌 URL bookmark stable (toujours a jour - lis le fichier GitHub) :
   ${BOOKMARK_URL}

🏠 Local dev (sur le PC) :
   ${LOCAL}

📡 LAN meme Wi-Fi :
   ${LAN}

📦 GitHub branche prod :
   ${GITHUB}

═══════════════════════════════════════════════════════
2. LOGIN
═══════════════════════════════════════════════════════

   Email    : ${TO_EMAIL}
   Password : ton mot de passe perso (deja reset 2026-05-29)
   Role     : admin

   Magic links sont aussi possibles via /login → "Recevoir un lien"

═══════════════════════════════════════════════════════
3. APPLICATION — MODULES EN PROD
═══════════════════════════════════════════════════════

A. PLANNING & EMPLOYEES
   • /planning                 : vue calendar semaine, drag & drop, hover details
   • /planning/employees       : liste employees actifs + on_leave
   • /planning/employees/[id]  : fiche detaillee
     - Sticky header + completion bar + quick nav scroll-spy
     - Tabs : Identite / Quota / Dispos / Sites / Empreintes / Avance / Mails / Embauche / Danger
     - Empreintes Tuya temps reel + heures auto-corrigees
     - Avance salaire editable (deduite des fiches paie suivantes)
     - Section "Mails" : 20 derniers mails recus + composer
   • Renforts demande + auto-cancel si shift comble par autre travailleur
   • Validations expirent max 1h apres debut du shift

B. CONTRATS (CDD + Etudiant, layout v8.1 inviolable)
   • DocuSeal Cloud integration (templates HTML + submissions)
   • Workflow : preview → screening valide → bouton signature → envoi
   • Copie employeur archivee automatiquement
   • Bouton "Imprimer sans pre-signature" pour signature manuelle
   • Validation champs : bloque envoi si manquants OU si start_date < today
   • NO-CDI policy : refuse les CDI (loi belge 1978)

C. FICHES DE PAIE (/admin/payslips)
   • Upload PDF batch → split auto par employee (FR + NL)
   • Anti-doublons strict (par employee+period+is_secondary)
   • Reattribution + edition montants + reset avance
   • Fiches differees J+6 (auto-unlock cron quotidien)
   • Filtre ville Bruxelles/Anvers + filtre employeur
   • QR EPC SEPA genere auto pour paiement BNP → employee
   • Watermark dynamique au moment d envoi (nom, email, date, ref)
   • Bulk actions : "marquer payees" + "envoyer en bloc"
   • Audit log : qui a partage quoi, quand, qui a consulte

D. CANDIDATURE PUBLIQUE (/postuler)
   • Form multi-section (identite, profil, motivation, legal)
   • Validation FR i18n + NL
   • Postes : Vendeur·se, Couture, Gestionnaire, Administratif, Marketing, IA
   • Heures par semaine : pas de limite max
   • Dispositifs Bxl multi-select : Activa, Activa LD, PEP, CPE, +57,
     Phare, PFI, PME tax shelter
   • CV upload + RGPD consent
   • Screening questionnaire 30 questions categorisees (/me/screening)

E. MAILS (/rh/mails)
   • Tous les mails sortants traces dans outbound_mails
   • Boite commune : hr@caftanfactory.com prioritaire
   • Composer manuel + attachments (Supabase Storage signed URLs 30j)
   • Section "Mails recus" cote candidat (/me/mails)
   • Audit log /api/docs/view/[token] pour tracker chaque consultation

F. UX GLOBAL
   • Cmd+K command palette (style Linear) : recherche employees,
     pages, actions rapides
   • Mobile responsive + safe-area iPhone
   • Push notifications (PWA + VAPID)
   • Light/Dark theme + toggle Bruxelles/Anvers

═══════════════════════════════════════════════════════
4. INTEGRATIONS ACTIVES
═══════════════════════════════════════════════════════

   • Supabase (Auth + DB + Storage + RLS)
   • DocuSeal Cloud (signatures electroniques)
   • EmailJS (transactionnel + boite hr@caftanfactory.com)
   • Tuya (empreintes pointage temps reel)
   • Cloudflare tunnel (acces externe iPhone)

═══════════════════════════════════════════════════════
5. ROADMAP — FEATURES A IMPLEMENTER
═══════════════════════════════════════════════════════

🚧 Backlog actif :

   #62  Module portail HR Consult (PENDING)
        → Auto-recup des fiches paie depuis e-services.hrconsult.com
        → Approche encore a trancher (Playwright cache / Extension Chrome
          / Webhook IMAP mail) — discussion en cours

   ⊘ #64 Gmail watcher (SKIP confirme)
        → On attend de voir la frequence reelle des mails HR Consult

📋 Pistes futures discutees :

   • UI section audit log sur fiche employee (le backend est pret,
     migration appliquee, manque le rendu visuel)
   • Tableau de bord stats salaires (evolution mensuelle, comparatif sites)
   • Auto-relance signature contrat J+1 / J+3 / J+7
   • Integration Dimona portail (declaration automatique)
   • Export comptable Winbooks/Sage des fiches paie payees
   • App mobile native React Native (PWA actuelle fonctionne deja)
   • IA assistant chat RH (questions employees → reponses sourcees CCT 201)

═══════════════════════════════════════════════════════
6. COMMITS RECENTS (caftan-rh-v2-prod)
═══════════════════════════════════════════════════════

   dfe994e  feat: form + audit log doc shares/views
   c5ea0d2  feat(watermark): tatouage dynamique fiches paie
   92d8982  fix(me/mails): liste vide PostgREST
   4eafd8a  fix: EmployeeMailsSection import
   3caf022  fix: QuickNav import
   70fdd9d  feat: bulk actions payslips + Cmd+K palette + fix build
   7f30251  feat: phase 2 mails composer + attachments + threading

Bonne soiree,
— CaftanRH (genere via scripts/send-recap-app-overview.mjs)
`;

const params = {
  to_email: TO_EMAIL,
  email: TO_EMAIL,
  user_email: TO_EMAIL,
  candidate_email: TO_EMAIL,
  to: TO_EMAIL,
  to_name: "Karim Elbazi",
  name: "Karim Elbazi",
  candidate_name: "Karim Elbazi",
  from_name: "Caftan Factory (By AMD Megastore)",
  reply_to: "hr@caftanfactory.com",
  subject,
  message: body,
  html_message: body.replace(/\n/g, "<br>"),
  body,
  content: body,
  html: body.replace(/\n/g, "<br>"),
};

console.log("Envoi du recap a", TO_EMAIL, "...");
const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
});
console.log("Status:", res.status);
if (!res.ok) {
  const txt = await res.text();
  console.error("Erreur EmailJS:", txt);
  console.log("\n--- BODY DU MAIL (backup copier/coller) ---\n");
  console.log(body);
  process.exit(1);
}
console.log("✓ Mail envoyé sur", TO_EMAIL);
