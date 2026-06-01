#!/usr/bin/env node
// Karim 2026-06-01 : MEGA RECAP - toutes les nouvelles features de cette
// session + URLs + roadmap. A lancer manuellement.
//   cd caftan-rh && node scripts/send-mega-recap-2026-06-01.mjs

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

let tunnel = "https://cod-remained-combinations-discs.trycloudflare.com";
const tunnelFile = resolve(__dirname, "../TUNNEL_URL.txt");
if (existsSync(tunnelFile)) {
  const m = readFileSync(tunnelFile, "utf8").match(/https?:\/\/[^\s]+/);
  if (m) tunnel = m[0];
}

const TO = "elbazikarim@gmail.com";
const subject = "CaftanRH — Récap 2026-06-01 : nouvelles features + roadmap";

const body = `Salut Karim,

═══════════════════════════════════════════════════════
0. URL TUNNEL ACTIF (testée 200 OK)
═══════════════════════════════════════════════════════

   ${tunnel}
   ${tunnel}/login
   ${tunnel}/planning/employees/cbc6d63a-ff65-44b7-bc6c-120c07f5a743 (Karim Elbazi fictif)

   Bookmark stable (toujours a jour, mis a jour par tunnel-keeper) :
   https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt

═══════════════════════════════════════════════════════
1. NOUVELLES FONCTIONNALITES (livrees cette session)
═══════════════════════════════════════════════════════

A. BULK ACTIONS PAYSLIPS (#80)
   • Checkboxes par fiche sur /admin/payslips
   • Barre flottante : marquer payees + envoyer en bloc + total selection
   • markPayslipsPaidBulkAction + sendPayslipsToEmployeesBulkAction

B. CMD+K COMMAND PALETTE (#80)
   • Style Linear, ouvert via Cmd+K / Ctrl+K
   • Recherche employees (server action) + pages + actions rapides
   • Navigation clavier ↑↓↵, admin/rh only

C. WATERMARK DYNAMIQUE PDFs (#81)
   • lib/pdf-watermark.ts (pdf-lib)
   • Diagonale COPIE PERSONNELLE + nom destinataire (opacity 0.10)
   • Pied de page 6px : Envoyée à <nom> · <email> · <date>
   • Reference doc en bas a droite (8 premiers chars id payslip)
   • Fallback safe : si pdf-lib crash → PDF original
   • Applique a sendPayslipToEmployeeAction (bulk send couvert aussi)

D. AUDIT LOG DOCUMENTS (#83)
   • Table document_audit_log : qui partage quoi, qui consulte, quand, IP, UA
   • lib/document-audit-log.ts helper logDocAudit
   • Route /api/docs/view/[token] redirect + log de chaque consultation
   • Tokenized URL base64 pour partage externe (exp 7j)
   • Integration sendPayslipToEmployeeAction : log share_email + URL trackee

E. FORMULAIRE CANDIDAT (#82)
   • Masquage placeholder "Ex. 38 / 20" + max=48 retiré (aucune limite heures)
   • Masquage "Magasin préféré"
   • Postes : ajout Couture, Administratif, Marketing, IA
   • "Activa Brussels" → multi-select dispositifs Bxl :
     Activa.brussels, Activa LD, Première Expérience Pro (PEP),
     Convention Premier Emploi (CPE <26), Senior +57, Phare/AViQ,
     PFI/alternance, PME tax shelter
   • i18n FR + NL synchronisés

F. URL TUNNEL-AWARE PARTOUT (lib/public-base-url.ts)
   Avant : 5 endroits implementaient leur propre logique de base URL.
   Maintenant : helper unique getPublicBaseUrl avec priorite :
     1. TUNNEL_URL.txt (mis a jour auto par tunnel-keeper.ps1)
     2. NEXT_PUBLIC_SITE_URL
     3. NEXT_PUBLIC_APP_URL / BASE_URL
     4. http://localhost:3000
   Couvre : trycloudflare.com, loca.lt, ngrok.
   tunnel-keeper.ps1 met aussi a jour .env.local automatiquement.

   Migrés :
   • pre-interview URLs (compléter profil candidat)
   • Magic links info-request
   • Signature contrat (template-actions)
   • Reset password (login/actions)
   • Tracking view PDF (payslips)
   • Bouton "Inviter" : URL credentials envoyée au worker plus en
     localhost mais sur le tunnel actif → cliquable depuis iPhone

G. RUPTURE CONTRAT COMMUN ACCORD (#84) - LETTRE 402.00 BE
   • Modele officiel BE 402.00 fidelement reproduit
   • Table contract_terminations + bucket Storage + RLS
   • Initiation admin/RH : status=approved direct
   • Initiation worker (/me/termination) : status=pending_admin +
     cooling-off 3 jours (trigger DB inviolable)
   • Validation RH avec date min imposee
   • Mode "Imprimer" : papier mention manuscrite "lu et approuve"
     + cases vides pour signature stylo
   • Mode "Aperçu / Envoyer" : signature electronique eIDAS
   • DocuSeal integration : vrai PDF A4 + signature electronique
     avancee (AES) eIDAS UE 910/2014
   • Pre-signature employeur via profiles.signature_data_url
     (parite contrats) : si signature stockee → embedded image →
     1 seul signataire DocuSeal (Employee)
   • Mention "Lu et approuve - signé électroniquement le JJ/MM/AAAA
     (eIDAS UE 910/2014)" auto sous chaque signature
   • Audit log document_audit_log integre

H. FIX BUILD + IMPORTS MANQUANTS
   • requireAuthenticated → requireUser dans /me/mails + /me/screening
   • QuickNav + EmployeeMailsSection imports manquants page.tsx
   • Middleware : /api/terminations + /api/docs/view exemptés du
     redirect login (auth multi-mode dans handler)

═══════════════════════════════════════════════════════
2. ROADMAP - features pending
═══════════════════════════════════════════════════════

🚧 EN ATTENTE (#62) - Module portail HR Consult
   Auto-recup fiches paie depuis e-services.hrconsult.com.
   Approche encore a trancher (Playwright cache / Extension Chrome
   semi-auto / Webhook IMAP mail). #64 Gmail watcher = SKIP confirmé.

═══════════════════════════════════════════════════════
3. SUGGESTIONS - features non evoquees a considerer
═══════════════════════════════════════════════════════

🎯 PRIORITE HAUTE (legales / production)
   • Signature electronique QUALIFIEE (QES) via itsme BE ou
     Connective Sign — equivalent strict signature manuscrite
     (DocuSeal AES suffit pour 99% RH mais QES = inattaquable).
   • Cron de rappel signature : J+2 / J+5 / J+7 si pas signé,
     auto-cancel si J+30 sans signature.
   • Webhook DocuSeal pour récupérer auto le PDF signé final
     + update du statut termination/contract dans la BD.
   • Dimona portail intégration (auto-déclaration ONSS).
   • Module conges payes + soldes + demandes en ligne (/me/leave).
   • Module note de frais + remboursement IBAN.

🎯 PRIORITE MOYENNE (UX / opérations)
   • UI section audit log sur fiche employee (qui a vu quoi, quand)
     - backend deja pret, manque le rendu.
   • Dashboard /rh/terminations centralise (toutes demandes
     pending au lieu de fiche-par-fiche).
   • Tableau de bord stats salaires : evolution mensuelle, comparatif
     sites, top 10 salaires/heures, anomalies.
   • Export comptable Winbooks/Sage des fiches paie payees.
   • Bulk actions sur employees (changer statut, exporter, mail).
   • Filter sauvegardes (/admin/payslips, /planning/employees).
   • Recherche full-text dans /rh/mails.

🎯 NICE-TO-HAVE (croissance)
   • App mobile native React Native (PWA actuelle deja propre).
   • IA assistant chat RH : reponses sourcees CCT 201,
     workflow auto pour demandes communes.
   • Webhook entrant Stripe/Mollie pour paiements salaires auto.
   • Integration Slack/Teams pour notifications RH (au-dela de Push).
   • Anonymisation auto des donnees apres 12 mois (RGPD).
   • Connecteur Excel/Google Sheets pour reporting libre.
   • Multi-tenant : preparer le terrain pour d'autres clients RH.

═══════════════════════════════════════════════════════
4. COMMITS RECENTS (caftan-rh-v2-prod)
═══════════════════════════════════════════════════════

   45299ff  feat(termination): mode print papier + pre-signature + date FR
   67da3e2  fix(termination): remplace mention manuscrite par eIDAS auto
   43dbbff  fix(termination): wrapper A4 visible + bouton imprimer auto
   a224e8c  feat(termination): signature electronique DocuSeal + PDF A4
   bbf66c3  fix(termination): middleware + meme-origine
   174a2c4  fix(invite): URL identifiants tunnel au lieu de localhost
   10cd998  refactor(public-url): helper unifie getPublicBaseUrl
   bba9ca2  fix(pre-interview): TUNNEL_URL.txt > env
   92d8982  fix(me/mails): liste vide PostgREST
   c5ea0d2  feat(watermark): tatouage dynamique fiches paie
   70fdd9d  feat: bulk actions payslips + Cmd+K palette
   dfe994e  feat: form + audit log doc shares/views
   88a4975  chore: apply-termination-migration script
   5f90735  feat: rupture contrat commun accord (lettre 402.00)
   5bb18c4..efb2fee  divers

═══════════════════════════════════════════════════════
5. POUR TESTER MAINTENANT (depuis iPhone)
═══════════════════════════════════════════════════════

A. Renvoie la rupture en pre-signé :
   1. Ouvre ${tunnel}/planning/employees/cbc6d63a-ff65-44b7-bc6c-120c07f5a743
   2. Clic "Rupture amiable" → modal affiche le PDF deja approuvé
   3. Re-clic "Envoyer signature" → nouveau mail DocuSeal avec ta
      signature embedded (1 seul signataire = Karim Elbazi fictif)

B. Envoie un contrat pre-signé Karim Elbazi :
   1. Ouvre ${tunnel}/planning/employees/cbc6d63a-ff65-44b7-bc6c-120c07f5a743
   2. Clic bouton "Signer contrat" sur la fiche
   3. Choisir template (employee/employee_pt/student)
   4. La signature stockée embedded → 1 seul signataire (Karim)

Bonne journee,
— CaftanRH
`;

const params = {
  to_email: TO, email: TO, user_email: TO, candidate_email: TO,
  to: TO, to_name: "Karim Elbazi", name: "Karim Elbazi", candidate_name: "Karim Elbazi",
  from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
  subject, message: body, html_message: body.replace(/\n/g, "<br>"),
  body, content: body, html: body.replace(/\n/g, "<br>"),
};

console.log("Envoi du mega-recap...");
const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
});
console.log("Status:", res.status);
if (!res.ok) {
  console.error(await res.text());
  console.log("\n--- BODY (copier/coller backup) ---\n");
  console.log(body);
  process.exit(1);
}
console.log(`✓ Mega-recap envoyé sur ${TO}`);
