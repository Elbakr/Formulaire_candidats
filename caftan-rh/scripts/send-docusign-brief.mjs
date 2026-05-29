#!/usr/bin/env node
// Karim 2026-05-29 : email brief DocuSign avec toutes les infos a fournir
// pour la creation du compte + integration technique.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

const TO_EMAIL = "elbazikarim@gmail.com";
const subject = "CaftanRH — DocuSign : brief signup AMD Megastore + integration technique";
const body = `Salut Karim,

Tu as demande si je peux creer le compte DocuSign a ta place : NON pour 2 raisons
techniques :
1. Carte bancaire physique requise (CVV non extractible)
2. Signature legale du titulaire requise (CGU + tax form)

PAR CONTRE je te prepare TOUT le reste. Suis ces etapes :

═════════ ETAPE 1 — SIGNUP COMPTE DOCUSIGN ═════════

URL : https://www.docusign.com/products-and-pricing
Plan recommande : DocuSign Business Pro EU (~40 EUR/mois)
- Datacenter EU obligatoire (RGPD)
- Signature electronique qualifiee eIDAS (= valeur legale manuscrite)
- 100+ envois/mois
- Templates reutilisables

Infos a fournir au signup :
- Raison sociale : AMD MEGASTORE SRL
- BCE : 0660.936.422
- Adresse : Rue de Brabant 230, 1030 Schaerbeek
- Email contact (recommande) : utiliser une adresse pro pas perso
- Tel : ton numero
- Card : ta CB

═════════ ETAPE 2 — CONFIGURATION ADMIN DOCUSIGN ═════════

Une fois compte cree, dans Admin :

A) Apps and Keys > "Add App and Integration Key"
   - Note l Integration Key (UUID)
   - Note ton User ID (visible dans le meme ecran)
   - Note Account ID (visible dans header admin, format GUID)

B) Generer une RSA keypair pour JWT auth :
   Sur ta machine :
   openssl genrsa -out docusign_private.key 2048
   openssl rsa -in docusign_private.key -pubout -out docusign_public.key

   Dans DocuSign Admin > Apps > ton app :
   - Onglet "RSA Public Keys" > Add
   - Coller le contenu de docusign_public.key
   - Garder docusign_private.key SECRET (ne pas commit)

C) Connect (webhooks) :
   Admin > Connect > Add Configuration
   - URL : https://<your-vercel-domain>/api/docusign/webhook
   - Events : Envelope Sent, Delivered, Completed, Declined, Voided
   - Add SHA256 secret -> note-le

═════════ ETAPE 3 — VARIABLES D ENV ═════════

Une fois etape 2 finie, envoie-moi ces 5 valeurs (par mail securise ou
juste en les ajoutant directement dans .env.local et sur Vercel) :

DOCUSIGN_BASE_URL=https://eu.docusign.net/restapi
DOCUSIGN_OAUTH_URL=https://account.docusign.com
DOCUSIGN_INTEGRATION_KEY=<UUID>
DOCUSIGN_USER_ID=<UUID>
DOCUSIGN_ACCOUNT_ID=<GUID>
DOCUSIGN_PRIVATE_KEY_B64=<base64 du contenu de docusign_private.key>
DOCUSIGN_WEBHOOK_SECRET=<le SHA256 secret>

Pour encoder la cle privee en base64 :
  cat docusign_private.key | base64 -w 0

═════════ ETAPE 4 — INTEGRATION CODE ═════════

J ai deja prepare le squelette : src/lib/docusign-config.ts
Une fois les vars d env settees, je code :
- Action sendContractForSignature(employeeId, contractId)
- Route /api/docusign/webhook qui catch les events Connect
- Page /admin/contracts qui montre le statut DocuSign de chaque envelope
- Migration BD pour ajouter colonnes docusign_envelope_id + docusign_status
  a employee_contracts

═════════ POURQUOI PAS UN SCRIPT POUR ONSS / SECRETARIAT SOCIAL ═════════

Tu m as demande si script automatique = solution OK. Reponse nuancee :

SCRIPT OK pour :
- ONSS Dimona : ils ont une VRAIE API officielle (e-Dimona REST/SOAP).
  Pas besoin de scraper. Tres robuste. Je peux integrer ca proprement.

SCRIPT RISQUE pour portail secretariat social :
- UI change a chaque mise a jour -> script casse silencieusement
- Captcha / 2FA / OTP par SMS -> bloque automation
- Si erreur encode = correction manuelle obligatoire chez eux
- Sanctions ONSS possibles si declaration fausse
- Pas de traces papier pour litige

RECO IMMEDIATE (deja en cours d implementation par l agent 2) :
Email structure + PDF en piece jointe vers le secretariat social.
- Format standard belge (SD Worx / Securex acceptent les PDF normaux)
- Traces auditables (mails envoyes + logs)
- Pas de risque de bug silencieux
- Karim valide chaque envoi avant qu il parte

═════════ STATUS IMPLEMENTATION ACTUELLE ═════════

✓ Renderer multi-entites (AMD Megastore + Caftan Factory) - FAIT
✓ Squelette DocuSign + brief signup - FAIT (cet email)
EN COURS :
- Migration BD : birth_date, birth_place, signature_place,
  transport_frequency, work_time_kind (agent 1)
- UI form employee etendue (agent 1)
- Page /planning/employees/[id]/secsoc + envoi mail PDF (agent 2)
- Retrait CDI du select contract_kind (agent 1)

PROCHAINES ETAPES (apres signup DocuSign) :
- Integration webhook DocuSign
- Templates NL pour Anvers (Karim fournira)
- Migration ajouter docusign_* a employee_contracts

A +,
Claude
`;

const params = {
  to_email: TO_EMAIL, email: TO_EMAIL, user_email: TO_EMAIL, candidate_email: TO_EMAIL,
  to: TO_EMAIL, to_name: "Karim", name: "Karim", candidate_name: "Karim",
  from_name: "CaftanRH", reply_to: "hr@caftanfactory.com",
  subject, message: body, html_message: body.replace(/\n/g, "<br>"),
  body, html: body.replace(/\n/g, "<br>"), content: body,
};
const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({ service_id: SERVICE_ID, template_id: TEMPLATE_ID, user_id: PUBLIC_KEY, template_params: params }),
});
console.log(`Status: ${res.status} | ${await res.text()}`);
