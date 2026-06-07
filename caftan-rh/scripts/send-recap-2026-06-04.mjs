#!/usr/bin/env node
// Karim 2026-06-04 : recap complet apres push 06419ab
// FR -> elbazikarim@gmail.com
// NL -> kamal@elbazi.com
// Garde-fou : verifie que le body ne contient AUCUNE URL localhost
// (memory feedback_no_localhost_in_mails).

import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE || !TEMPLATE || !KEY) { console.error("EmailJS env manquants"); process.exit(1); }
if (!SUPA_URL || !SVC_KEY) { console.error("Supabase env manquants"); process.exit(1); }

const tunnelTxt = readFileSync(resolve(__dirname, "../TUNNEL_URL.txt"), "utf8");
const TUNNEL = tunnelTxt.split("\n")[0].trim().replace(/^﻿/, "");
const PROD = "https://caftan-rh-v2-prod.vercel.app";
const BOOKMARK = "https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt";
const DEEP_FR = `${TUNNEL}/lang/fr?to=/me`;
const DEEP_NL = `${TUNNEL}/lang/nl?to=/me`;

// Magic link 1h pour Kamal - redirect_to = PROD (stable, jamais localhost)
const sb = createClient(SUPA_URL, SVC_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: link } = await sb.auth.admin.generateLink({
  type: "magiclink", email: "kamal@elbazi.com",
  options: { redirectTo: `https://caftan-rh-v2-prod.vercel.app/lang/nl?to=/me` },
});
let MAGIC_KAMAL = link?.properties?.action_link;
if (!MAGIC_KAMAL) { console.error("Magic link Kamal KO"); process.exit(1); }
// Sanitise : si le Supabase Site URL fallback contient localhost, on rewrite
if (/localhost|127\.0\.0\.1/.test(MAGIC_KAMAL)) {
  MAGIC_KAMAL = MAGIC_KAMAL.replace(/redirect_to=[^&]+/g,
    `redirect_to=${encodeURIComponent("https://caftan-rh-v2-prod.vercel.app/lang/nl?to=/me")}`);
  // Si encore localhost dans le base, prefer login page direct
  if (/localhost|127\.0\.0\.1/.test(MAGIC_KAMAL)) {
    console.warn("Supabase Auth Site URL = localhost - magic link non-utilisable. Fallback : page login prod.");
    MAGIC_KAMAL = "https://caftan-rh-v2-prod.vercel.app/login";
  }
}

const FR = `Salut Karim,

Recap complet du jour - push 06419ab deploye.

═══════════════════════════════════════
ACCES DISTANT (jamais localhost - 100% remote)
═══════════════════════════════════════

🌐 Tunnel actif (rotation quotidienne) :
👉 ${TUNNEL}

🚀 Prod Vercel (toujours stable, idem appli native) :
👉 ${PROD}

📌 Bookmark stable (toujours a jour, lit la rotation) :
👉 ${BOOKMARK}

🔗 Forcer FR direct : ${DEEP_FR}

═══════════════════════════════════════
NOUVEAUTES DU JOUR (04/06)
═══════════════════════════════════════

🔥 SYNC GRAVITY FORMS - FIX DEFINITIF
Cause racine identifiee : contrainte uniq email bloquait silencieusement
les re-candidatures (398 candidats valides perdus depuis le 1er juin).
Fix : detection email existant -> UPDATE + ajoute application "new" pour
tracer l historique. Tous les 398 ont ete recuperes en BD.
+ Monitoring : cron horaire qui alerte par mail si sync repart en panne.

🧹 PURGE DOUBLONS
- Candidats (/admin/candidates/duplicates) : detection email/telephone/
  nom+naissance, merge securise avec transfert des FK (applications,
  documents, screening, employees, mails) puis DELETE des duplicates.
- Employes (/admin/employees/duplicates) : detection NRN/nom+naissance,
  approche conservatrice (archive au lieu de delete car trop de FK
  critiques : contrats, payslips, Dimona, conges).
- Script CLI : node scripts/purge-duplicate-candidates.mjs (dry-run +
  --apply).

📋 BOUTON SIGNATURE - 3 ETATS INTELLIGENTS
- Vert "Envoyer a signer" : pas encore envoye
- Ambre "Attente de signature" (pulse) : envoye, pas signe
- Emeraude "Voir contrat signe" (link PDF) : signe par les 2 parties
Plus de risque de re-envoyer un contrat deja signe.

🟢 REEMBAUCHE 1 CLIC
Sur la fiche d un ex-employe : bouton "Reembaucher" → status=active +
nouveau contrat + saute le questionnaire profilage + conserve historique
(fiches paie, ruptures, NRN, IBAN, formations).

🛡 BYPASS SCREENING ADMIN
Dans le dialog "Envoyer a signer", section ambre depliable. Raison
obligatoire et loggee dans activity_log pour audit. Outrepasse les 3
checks (questionnaire / non-PASS / valide RH).

🔴 CHAMPS CONTRAT EN ROUGE
Sur la fiche admin et cote travailleur : champs requis non remplis
surlignes en rouge avec badge "Requis contrat". Plus besoin de chercher.

📝 FORMULAIRE DYNAMIQUE /me/contract-info
Quand RH clique "Demander X infos", mail au travailleur avec magic link
1h → page /me/contract-info qui n affiche QUE les champs manquants
en rouge. Une fois rempli : RH notifie auto, contrat dispo a envoyer.

📊 RAPPORT MENSUEL ADMIN (cron 1er du mois 7h)
Mail KPI : paie, embauches, ruptures, Dimona pending, notes de frais,
formations expirees + actions recommandees + liens directs.

✍️ DEFAUT CONTRAT = VARIABLE
Article 5 bascule en horaire variable / flottant sur les 3 templates
(CDD plein, CDD partiel, Etudiant). Reflete la realite retail
(planning hebdo qui change). Texte intact, seul le ☒/☐ change.

📦 MODULES DEJA LIVRES (rappel)
- Notes de frais (/me/expenses + /rh/expenses) + QR EPC SEPA
- Formations & certifications (/rh/trainings) - 10 types, alertes < 60j
- Anonymisation auto RGPD (cron mensuel candidats > 12 mois)
- Auto-Dimona depuis webhook DocuSeal (IN signature + OUT rupture)
- Compte Kamal admin+travailleur NL
- Cron quotidien tunnel bilingue (FR Karim + NL Kamal)
- Alerte liens mails casses (cron 6h)
- Reset annuel soldes conges 1er janvier (CCT 201)

═══════════════════════════════════════
LIENS DIRECTS (Vercel prod ou tunnel)
═══════════════════════════════════════

🔗 Login              : ${PROD}/login
👥 Planning employes  : ${PROD}/planning/employees
📅 Calendrier semaine : ${PROD}/planning/calendar
💰 Fiches de paie     : ${PROD}/admin/payslips
📊 Stats salaires     : ${PROD}/rh/stats
✍️  Signature contrat  : ${PROD}/admin/settings/my-signature
✍️  Ruptures amiables : ${PROD}/rh/terminations
🧹 Doublons candidats : ${PROD}/admin/candidates/duplicates
⚠️  Doublons employes : ${PROD}/admin/employees/duplicates
🎓 Formations         : ${PROD}/rh/trainings
💸 Notes de frais     : ${PROD}/rh/expenses
📨 Mails sortants     : ${PROD}/rh/mails
📁 Documents valise   : ${PROD}/rh/documents
🤖 IA assistant       : ${PROD}/rh/ai
📱 Dashboard mobile   : ${PROD}/m
❓ FAQ                 : ${PROD}/faq

═══════════════════════════════════════
A FAIRE / DECISIONS EN ATTENTE
═══════════════════════════════════════

⏳ Ali : credentials Gmail App Password + Resend domain verif +
   Gmail delegation (pour PJ natives et envoi depuis hr@)
⏳ Module portail HR Consult (Playwright + mode hybride) - need
   decision strategie scraping vs API officielle
⏳ Tu veux que je creuse une option "horaire variable" propre pour
   les CDD plein (actuellement = horaire flottant) ?

— CaftanRH (push 06419ab, 04/06/2026)
`;

const NL = `Hallo Kamal,

Volledige samenvatting van vandaag - push 06419ab gedeployd.

═══════════════════════════════════════
REMOTE TOEGANG (nooit localhost - 100% remote)
═══════════════════════════════════════

🌐 Actieve tunnel (dagelijkse rotatie) :
👉 ${TUNNEL}

🚀 Vercel productie (altijd stabiel) :
👉 ${PROD}

📌 Stabiele bookmark (altijd up-to-date) :
👉 ${BOOKMARK}

🔗 Jouw 1-klik login (magic link, 1u geldig, direct NL) :
👉 ${MAGIC_KAMAL}

🔗 Direct NL na login : ${DEEP_NL}

═══════════════════════════════════════
NIEUWIGHEDEN VAN VANDAAG (04/06)
═══════════════════════════════════════

🔥 GRAVITY FORMS SYNC - DEFINITIEVE FIX
Hoofdoorzaak : unique email beperking blokkeerde stil de
heraanvragen (398 geldige kandidaten verloren sinds 1 juni).
Fix : email-bestaat detectie -> UPDATE + voegt "new" application toe
voor historiek tracking. Alle 398 hersteld in DB.
+ Monitoring : uur-cron stuurt mail bij sync-panne.

🧹 DUBBELE PURGE
- Kandidaten (/admin/candidates/duplicates) : detectie email/telefoon/
  naam+geboorte, veilige merge met FK-transfer (applications, documents,
  screening, employees, mails) gevolgd door DELETE.
- Werknemers (/admin/employees/duplicates) : detectie INSZ/naam+geboorte,
  conservatieve aanpak (archiveren ipv delete - te veel kritische FK :
  contracten, loonfiches, Dimona, verlof).

📋 HANDTEKENINGKNOP - 3 SLIMME STATUSSEN
- Groen "Versturen ter ondertekening" : nog niet verzonden
- Amber "Wachten op handtekening" (pulse) : verzonden, niet ondertekend
- Smaragd "Bekijk ondertekend contract" (PDF link) : door beide getekend

🟢 1-KLIK HERAANWERVING
Ex-werknemerfiche : "Opnieuw aanwerven" knop → status=active + nieuw
contract + slaat profileringsvragenlijst over + behoudt historiek.

🛡 ADMIN BYPASS SCREENING
Amber inklapbare sectie in "Versturen" dialog. Verplichte reden,
gelogd in activity_log voor audit. Overschrijft de 3 checks.

🔴 CONTRACT VELDEN IN ROOD
Op admin-fiche en werknemer-zijde : vereiste niet-ingevulde velden
gemarkeerd in rood met "Vereist contract" badge.

📝 DYNAMISCH FORMULIER /me/contract-info
Wanneer HR "Vraag X info aan" klikt, mail naar werknemer met 1u-magic
link → /me/contract-info pagina die ALLEEN ontbrekende velden in rood
toont. Na invullen : HR automatisch genotificeerd, contract gereed.

📊 MAANDELIJKS ADMIN RAPPORT (cron 1e van de maand 7u)
KPI mail : loon, aanwervingen, beeindigingen, Dimona pending,
onkostennota's, vervallen opleidingen + aanbevolen acties.

✍️ STANDAARD CONTRACT = VARIABEL
Artikel 5 schakelt naar variabel/zwevend uurrooster op de 3 templates
(voltijds CDD, deeltijds CDD, Student). Weerspiegelt de retail-realiteit
(weekplanning wijzigt). Tekst intact, alleen ☒/☐ wijzigt.

📦 REEDS GELEVERDE MODULES (herinnering)
- Onkostennota's (/me/expenses + /rh/expenses) + QR EPC SEPA
- Opleidingen & certificaten (/rh/trainings) - 10 types, alerts < 60d
- Auto AVG anonimisering (maandelijkse cron kandidaten > 12 maanden)
- Auto-Dimona via DocuSeal webhook (IN handtekening + OUT beeindiging)
- Dagelijkse tweetalige tunnel cron (FR Karim + NL Kamal)
- Kapotte mail links alerts (6u cron)
- Jaarlijkse verlofreset 1 januari (CAO 201)

═══════════════════════════════════════
DIRECTE LINKS (Vercel productie)
═══════════════════════════════════════

🔗 Login              : ${PROD}/login
👥 Werknemers planning: ${PROD}/planning/employees
📅 Weekplanning       : ${PROD}/planning/calendar
💰 Loonfiches         : ${PROD}/admin/payslips
📊 Loon statistieken  : ${PROD}/rh/stats
✍️  Mijn handtekening : ${PROD}/admin/settings/my-signature
✍️  Beeindigingen     : ${PROD}/rh/terminations
🧹 Dubbele kandidaten : ${PROD}/admin/candidates/duplicates
⚠️  Dubbele werknemers: ${PROD}/admin/employees/duplicates
🎓 Opleidingen        : ${PROD}/rh/trainings
💸 Onkostennota's     : ${PROD}/rh/expenses
📨 Uitgaande mails    : ${PROD}/rh/mails
📁 Documenten valies  : ${PROD}/rh/documents
🤖 AI assistant       : ${PROD}/rh/ai
📱 Mobile dashboard   : ${PROD}/m
❓ FAQ                 : ${PROD}/faq

═══════════════════════════════════════
HOE DE 3 KNOP-STATUSSEN TESTEN
═══════════════════════════════════════

1. Status "Versturen" (groen) - Ga naar volledige werknemerfiche.
2. Status "Wachten" (amber pulse) - Stuur een contract.
3. Status "Bekijk ondertekend" (smaragd) - Na werknemer-handtekening.

Je krijgt elke ochtend een mail met de nieuwe tunnel URL en
nieuwe features (Karim ontvangt FR, jij NL).

— CaftanRH (push 06419ab, 04/06/2026)
`;

// Garde-fou : refuse l envoi si le body contient localhost
function checkBody(body, who) {
  const bad = body.match(/https?:\/\/(localhost|127\.0\.0\.1|192\.168\.[\d.]+)[^\s]*/gi);
  if (bad) {
    console.error(`❌ ${who} : URL localhost detectee dans le body :`);
    for (const url of bad) console.error(`   - ${url}`);
    return false;
  }
  return true;
}
if (!checkBody(FR, "FR Karim") || !checkBody(NL, "NL Kamal")) {
  console.error("\nEnvoi ANNULE par garde-fou anti-localhost.");
  process.exit(1);
}

async function send(to, name, subject, body, replyTo = "hr@caftanfactory.com") {
  const params = {
    to_email: to, email: to, user_email: to, candidate_email: to,
    to, to_name: name, name, candidate_name: name,
    from_name: "CaftanRH (recap)", reply_to: replyTo,
    subject, message: body, html_message: body.replace(/\n/g, "<br>"),
    body, content: body, html: body.replace(/\n/g, "<br>"),
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
  });
  return { ok: res.ok, status: res.status };
}

console.log(`Tunnel actif : ${TUNNEL}`);
console.log(`Prod Vercel  : ${PROD}`);
console.log(`Anti-localhost : OK`);

const r1 = await send("elbazikarim@gmail.com", "Karim Elbazi",
  "CaftanRH — Recap 04/06 + nouveautes du jour (push 06419ab)", FR);
console.log(`FR Karim    : HTTP ${r1.status}`);

const r2 = await send("kamal@elbazi.com", "Kamal Elbazi",
  "CaftanRH — Samenvatting 04/06 + nieuwe features (push 06419ab)", NL);
console.log(`NL Kamal    : HTTP ${r2.status}`);

console.log("Done.");
