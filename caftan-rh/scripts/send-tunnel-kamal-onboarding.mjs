#!/usr/bin/env node
// Karim 2026-06-03 : envoie le mail "tunnel + onboarding Kamal" en 2 versions :
//   1. FR -> elbazikarim@gmail.com (recap features + tunnel)
//   2. NL -> kamal@elbazi.com (idem, neerlandais, magic link login + lien NL direct)
//
// Pas de password en clair dans les mails : magic link 1h via Supabase Auth.
// Lecture du tunnel actif depuis TUNNEL_URL.txt (premiere ligne).

import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) { console.error("EmailJS env vars manquants"); process.exit(1); }
if (!SUPA_URL || !SVC_KEY) { console.error("Supabase env vars manquants"); process.exit(1); }

// Lit tunnel
const tunnelTxt = readFileSync(resolve(__dirname, "../TUNNEL_URL.txt"), "utf8");
const TUNNEL = tunnelTxt.split("\n")[0].trim();

// Liens deep-language
const DEEP_FR = `${TUNNEL}/lang/fr?to=/me`;
const DEEP_NL = `${TUNNEL}/lang/nl?to=/me`;

// Magic link Kamal (1h)
const sb = createClient(SUPA_URL, SVC_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
  type: "magiclink",
  email: "kamal@elbazi.com",
  options: { redirectTo: `${TUNNEL}/lang/nl?to=/me` },
});
if (linkErr || !link?.properties?.action_link) {
  console.error("generateLink failed:", linkErr);
  process.exit(1);
}
const MAGIC_LINK_KAMAL = link.properties.action_link;
console.log("Magic link Kamal genere (1h valide)");

const NEW_FEATURES_FR = `
✅ NOUVEAUTES DEPUIS HIER (3 juin)

1. Bouton "Envoyer à signer" → 3 etats intelligents
   - Pas envoye : bouton vert "Envoyer a signer"
   - En cours : bouton ambre "Attente de signature" (animation pulse)
   - Signe : bouton emeraude "Voir contrat signe" (link PDF direct)
   Plus de risque de re-envoyer un contrat deja signe.

2. Reembauche rapide ancien employe
   Sur la fiche d'un ex-employe, bouton vert "Reembaucher" :
   - 1 clic : status repasse a active + nouveau contrat (dates + heures)
   - Conserve tout l'historique (fiches paie, ruptures, formations, NRN, IBAN)
   - Saute le questionnaire de profilage (deja fait avant)

3. Bypass admin warnings screening
   Section ambre depliable dans le dialog "Envoyer a signer" :
   - Champ raison obligatoire (logge dans activity_log)
   - Outrepasse les 3 checks (questionnaire complet / non-PASS / valide RH)

4. Auto-Dimona depuis webhook DocuSeal
   - Contrat signe -> Dimona IN auto creee (RH a juste a declarer)
   - Rupture signee -> Dimona OUT auto creee
   Plus de risque d'oubli ONSS.

5. URLs mails Supabase direct (fini les liens casses)
   Signed URLs Supabase Storage (30 jours) au lieu du tunnel cloudflared.
   Plus de "Tunnel offline" cote employe.

6. Alerte liens casses mails (cron 6h)
   Teste les URLs des mails envoyes des 7 derniers jours, notif RH si 4xx/5xx.

7. Module notes de frais (/me/expenses + /rh/expenses)
   Worker depose recus -> validation RH -> remboursement IBAN QR EPC SEPA.

8. Module formations & certifications (/rh/trainings)
   10 types (HACCP, BA4/BA5, ADR, secourisme, etc.) + alertes auto < 60j.

9. Anonymisation auto RGPD (cron mensuel)
   Candidats > 12 mois sans embauche : nom/email/tel/adresse anonymises.

10. Rapport mensuel admin (cron 1er du mois 7h)
    Mail recap KPI (paie, embauches, ruptures, alertes urgentes).

11. Reset annuel soldes conges (cron 1er janvier 0h05)
    Reset automatique CCT 201.

12. Compte Kamal cree
    kamal@elbazi.com en admin + travailleur actif, langue NL.
    Recevra le mail tunnel quotidien lui aussi (NL).
    Tu lui as deja communique le password de ton cote.
`;

const NEW_FEATURES_NL = `
✅ NIEUWIGHEDEN SINDS GISTEREN (3 juni)

1. Knop "Versturen ter ondertekening" → 3 slimme statussen
   - Niet verzonden : groene knop "Versturen ter ondertekening"
   - Lopend : amber knop "Wachten op handtekening" (pulse animatie)
   - Ondertekend : smaragd knop "Bekijk ondertekend contract" (PDF link)

2. Snelle herindienstneming oud-medewerker
   Op de fiche van een ex-medewerker, groene knop "Opnieuw aanwerven" :
   - 1 klik : status terug naar actief + nieuw contract
   - Behoudt alle geschiedenis (loonfiches, opleidingen, INSZ, IBAN)
   - Slaat de profileringsvragenlijst over

3. Admin bypass screening waarschuwingen
   Amber inklapbare sectie in dialog "Versturen ter ondertekening".

4. Auto-Dimona via DocuSeal webhook
   Contract ondertekend -> Dimona IN auto. Beeindiging -> Dimona OUT auto.

5. Directe Supabase URLs in mails (geen kapotte links meer)
   Signed URLs (30 dagen) ipv dagelijks veranderend cloudflared tunnel.

6. Kapotte mail links waarschuwing (cron elke 6u)
   Test URLs van laatste 7 dagen, notificatie HR bij 4xx/5xx.

7. Onkostennota module (/me/expenses + /rh/expenses)
   Werknemer dient bonnen in -> HR validatie -> IBAN terugbetaling QR EPC SEPA.

8. Opleidingen & certificaten module (/rh/trainings)
   10 types (HACCP, BA4/BA5, ADR, EHBO, enz.) + auto alerts < 60d.

9. Auto AVG anonymisering (maandelijkse cron)
   Kandidaten > 12 maanden zonder aanwerving worden geanonimiseerd.

10. Maandelijks admin rapport (cron 1e van de maand 7u)
    KPI samenvatting (loon, aanwervingen, beeindigingen, dringende alerts).

11. Jaarlijkse reset verlofsaldi (cron 1 januari 0u05)
    CAO 201 conform.

12. Account Kamal aangemaakt (jouw account)
    Toegang admin + actieve werknemer. Standaard NL. Dagelijks tunnel mail.
`;

const FR_BODY = `Salut Karim,

Recap du jour : nouvelles features + tunnel actif + onboarding Kamal.

═══════════════════════════════════════
ACCES TUNNEL (3 juin 2026)
═══════════════════════════════════════

Tunnel actif (stable, change rarement) :
👉 ${TUNNEL}

Bookmark stable (toujours a jour) :
👉 https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt

Pages directes :
- Login         : ${TUNNEL}/login
- Espace admin  : ${TUNNEL}/admin
- Planning      : ${TUNNEL}/planning/employees
- Stats salaires: ${TUNNEL}/rh/stats
- Dashboard mobile : ${TUNNEL}/m
- Notes de frais   : ${TUNNEL}/rh/expenses
- Formations       : ${TUNNEL}/rh/trainings
- Documents valise : ${TUNNEL}/rh/documents
- FAQ              : ${TUNNEL}/faq
- Forcer FR        : ${DEEP_FR}

GitHub branche prod :
https://github.com/Elbakr/Formulaire_candidats/tree/caftan-rh-v2-prod
${NEW_FEATURES_FR}
═══════════════════════════════════════
KAMAL (kamal@elbazi.com)
═══════════════════════════════════════

Compte cree :
- Acces admin (toutes les pages /admin /rh /planning)
- Profile employe actif lie a son compte (test cote /me)
- Langue par defaut : NL (interface neerlandaise)

Magic link 1h envoye dans son mail NL. Il pourra definir son mot de passe
apres la 1ere connexion (page /login/reset-password).
Pour le password partage : transmets-le-lui directement par WhatsApp/SMS,
pas en clair dans le mail (securite).

Lien NL direct (a partager avec lui) :
👉 ${DEEP_NL}

═══════════════════════════════════════
COMMENT TESTER LES 3 ETATS BOUTON SIGNATURE
═══════════════════════════════════════

1. Etat "Envoyer a signer" (vert)
   Va sur une fiche employee complete (sans contrat en cours).

2. Etat "Attente de signature" (ambre, pulse)
   Envoie un contrat. Le bouton devient ambre tant que docuseal_status est
   sent/opened/pending.

3. Etat "Voir contrat signe" (emeraude)
   Une fois que l'employee a signe (webhook DocuSeal recu),
   le bouton devient emeraude et pointe directement le PDF signe.

═══════════════════════════════════════

— CaftanRH (recap auto matinal)
`;

const NL_BODY = `Hallo Kamal,

Welkom in CaftanRH ! Karim heeft een account voor jou aangemaakt zodat
je de applicatie kan testen.

═══════════════════════════════════════
JOUW EERSTE LOGIN
═══════════════════════════════════════

Klik op deze link om automatisch in te loggen (geldig 1 uur) :
👉 ${MAGIC_LINK_KAMAL}

Eenmaal ingelogd kan je je wachtwoord instellen via /login/reset-password
(of vraag Karim om het wachtwoord rechtstreeks via WhatsApp/SMS te delen).

Email     : kamal@elbazi.com
Rol       : admin (+ actieve werknemer voor /me tests)
Taal      : NL (standaard, kan je wijzigen in profielinstellingen)

═══════════════════════════════════════
TUNNEL TOEGANG (3 juni 2026)
═══════════════════════════════════════

Actieve tunnel (stabiel) :
👉 ${TUNNEL}

Stabiele bookmark (altijd up-to-date) :
👉 https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt

Directe pagina's (NL) :
- Login           : ${TUNNEL}/login
- Admin ruimte    : ${TUNNEL}/admin
- Planning        : ${TUNNEL}/planning/employees
- Loon statistieken : ${TUNNEL}/rh/stats
- Mobile dashboard: ${TUNNEL}/m
- Onkostennota's  : ${TUNNEL}/rh/expenses
- Opleidingen     : ${TUNNEL}/rh/trainings
- Documenten valies : ${TUNNEL}/rh/documents
- FAQ             : ${TUNNEL}/faq
- Direct in NL    : ${DEEP_NL}

GitHub prod branche :
https://github.com/Elbakr/Formulaire_candidats/tree/caftan-rh-v2-prod
${NEW_FEATURES_NL}
═══════════════════════════════════════
HOE DE 3 KNOP-STATUSSEN TESTEN
═══════════════════════════════════════

1. Status "Versturen ter ondertekening" (groen)
   Ga naar een volledige werknemer-fiche (zonder lopend contract).

2. Status "Wachten op handtekening" (amber, pulse)
   Stuur een contract. De knop wordt amber zolang docuseal_status
   sent/opened/pending is.

3. Status "Bekijk ondertekend contract" (smaragd)
   Zodra de werknemer ondertekent (DocuSeal webhook ontvangen),
   wordt de knop smaragd en wijst direct naar de ondertekende PDF.

═══════════════════════════════════════

Je krijgt elke ochtend een mail met de nieuwe tunnel URL en de nieuwe features.

— CaftanRH (automatische dagelijkse recap)
`;

async function send(to, name, subject, body, replyTo = "elbazikarim@gmail.com") {
  const params = {
    to_email: to, email: to, user_email: to, candidate_email: to,
    to, to_name: name, name, candidate_name: name,
    from_name: "CaftanRH (recap auto)", reply_to: replyTo,
    subject, message: body, html_message: body.replace(/\n/g, "<br>"),
    body, html: body.replace(/\n/g, "<br>"), content: body,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE_ID, template_id: TEMPLATE_ID, user_id: PUBLIC_KEY, template_params: params }),
  });
  return { ok: res.ok, status: res.status };
}

console.log(`Tunnel actif : ${TUNNEL}`);
const r1 = await send("elbazikarim@gmail.com", "Karim", "CaftanRH — Recap 03/06 + tunnel + onboarding Kamal", FR_BODY);
console.log(`FR Karim    : HTTP ${r1.status}`);
const r2 = await send("kamal@elbazi.com", "Kamal", "CaftanRH — Welkom + tunnel + nieuwe features (03/06)", NL_BODY);
console.log(`NL Kamal    : HTTP ${r2.status}`);
console.log("Fait.");
