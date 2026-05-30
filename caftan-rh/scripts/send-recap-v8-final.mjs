#!/usr/bin/env node
// Karim 2026-05-29 : recap v8 FINAL grave en BD + URL tunnel testee.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE || !TEMPLATE || !KEY) { console.error("Missing EmailJS env"); process.exit(1); }

const TUNNEL = "https://coalition-ave-steal-permit.trycloudflare.com";

const subject = "CaftanRH — Recap v8 FINAL grave + tunnel teste OK";
const body = `Salut Karim,

═════════ 1. TUNNEL CLOUDFLARE — TESTE FONCTIONNEL ═════════

URL active (mise a jour auto par tunnel-keeper.ps1) :
👉 ${TUNNEL}

Tests HTTP effectues a l'instant :
✓ /login                                 -> 200 OK
✓ /planning                              -> 307 (redirect login = OK)
✓ /admin/settings/my-signature           -> 307 (redirect login = OK)

Tu peux ouvrir ces liens sur ton iPhone des maintenant :

🔗 Login                : ${TUNNEL}/login
🔗 Planning             : ${TUNNEL}/planning
🔗 Ma signature stockee : ${TUNNEL}/admin/settings/my-signature
🔗 Fiche Karim Elbazi   : ${TUNNEL}/planning/employees/cbc6d63a-ff65-44b7-bc6c-120c07f5a743
🔗 Liste employees      : ${TUNNEL}/planning/employees

Login : elbazikarim@gmail.com + ton mot de passe (reset il y a qq heures)

═════════ 2. CONTRATS v8 FINAUX — GRAVES EN BD ═════════

Commit d153fda pousse sur caftan-rh-v2-prod.
Migration archivee : supabase/migrations/20260620000560_contracts_v8_final.sql
(Re-appliquable sur n importe quel environnement)

Doublons retires (delta : employee -178 chars, employee_pt -14, student -193) :
  ✓ "Fait en deux exemplaires" : 2x -> 1x (HTML wrapper uniquement)
  ✓ "Chacune des parties reconnait..." : 2x -> 1x
  ✓ "Signature du travailleur / employeur" : 2x -> 1x
  ✓ "(et parapher toutes les pages)" : 2x -> 1x
  ✓ "*Biffer la mention inutile*" : 2x -> 1x (footer CSS)

4 changements de contenu appliques :
  1. Employee (temps plein) : ☒ 38h fixe coche par defaut (1ere case)
  2. Employee_pt (temps partiel) :
     - ☒ horaire VARIABLE coche par defaut
     - Mention "planning communique au moins 7 jours calendaires a l avance"
  3. Student : horaire variable coche par defaut
  4. Lieu de travail (tous) :
     "{{workplace}}, ou tout autre lieu d etablissement de l employeur
      selon les besoins de l entreprise."
     + fallback workplace = "Rue de Brabant 230, 1030 Schaerbeek"
       si aucun primarySite assigne
  5. Salaire (tous) :
     "La remuneration convenue est fixee selon le bareme salarial
      en vigueur de la Commission Paritaire n°201 (commerce de detail
      independant)..."
     au lieu de "{{gross_salary}} € bruts de l heure".

═════════ 3. TEST V8 FINAL ═════════

Submission test que j ai genere (mode 2-signataires) :
👉 https://docuseal.com/s/qhfpsw1J58FLgb

Pour tester le pipeline COMPLET via le bouton reel :
1. Connecte toi : ${TUNNEL}/login
2. Va sur fiche Karim Elbazi :
   ${TUNNEL}/planning/employees/cbc6d63a-ff65-44b7-bc6c-120c07f5a743
3. Clique "Envoyer a signer"
4. Tu recevras un mail v8 final dans ta boite

═════════ 4. FICHES DE PAIE / PORTAIL HR CONSULT ═════════

J ai recu ta nouvelle demande : automatiser le DL des feuilles de paie
depuis https://e-services.hrconsult.com/logon/, decoupage par employee,
generation QR EPC (SEPA) pour paiement.

J ai prepare un plan 3-phases mais j attend tes reponses sur 4 points
critiques avant de coder (champ avance simple ou table historique,
MFA portail oui/non, format PDF group e ou separe, par ou commencer).

Reponds-moi sur Claude des que tu peux.

═════════ A NOTER ═════════

- Tunnel-keeper tourne (PID 19192). L URL ci-dessus est stable tant que
  tu ne reboot pas le PC ni ne fermes le keeper.
- Si tu reboot, relance : powershell -ExecutionPolicy Bypass -File
  caftan-rh/scripts/tunnel-keeper.ps1
- La nouvelle URL apparait dans TUNNEL_URL.txt (auto-publie sur GitHub).

A +,
Claude
`;

const params = {
  to_email: "elbazikarim@gmail.com", email: "elbazikarim@gmail.com",
  user_email: "elbazikarim@gmail.com", candidate_email: "elbazikarim@gmail.com",
  to: "elbazikarim@gmail.com", to_name: "Karim", name: "Karim", candidate_name: "Karim",
  from_name: "Caftan Factory (By AMD Megastore)",
  reply_to: "hr@caftanfactory.com",
  subject, message: body, html_message: body.replace(/\n/g, "<br>"),
  body, html: body.replace(/\n/g, "<br>"), content: body,
};
const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
});
console.log(`Status: ${res.status} | ${await res.text()}`);
