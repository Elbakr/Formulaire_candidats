#!/usr/bin/env node
// Karim 2026-05-30 : mail récap test à distance + instruction pour recuperer
// la 13e fiche Lina Akhechaa (split bug corrige, faut redrop apres delete batch)

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const TARGET = "elbazikarim@gmail.com";

// URL tunnel actif lu en runtime
let TUNNEL = "https://poll-fcc-rough-constructed.trycloudflare.com";
try {
  const txt = readFileSync(resolve(__dirname, "../TUNNEL_URL.txt"), "utf8");
  const firstLine = txt.split(/\r?\n/)[0].trim();
  if (firstLine.startsWith("https://")) TUNNEL = firstLine;
} catch {}

const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

const subject = "CaftanRH — Test à distance + récupération 13e fiche Lina";
const body = `Salut Karim,

═══════ TUNNEL TESTÉ ═══════

🌐 ${TUNNEL}
Tunnel HTTP 200 OK (testé à l'instant).

═══════ ACTION REQUISE : récupérer la 13e fiche ═══════

Le bug splitter était : 2 pages "FEUILLE DE PAIE" du meme NISS étaient
combinées en un seul groupe. Pour Lina Akhechaa qui a 2 fiches dans le
PDF (pages 10-11), seule une fiche fusionnée a été créée (net 395.57€).

Le fix est appliqué (commit en cours). Pour récupérer la 13e fiche :

1. Va sur ${TUNNEL}/admin/payslips
2. Dans "Derniers imports", clic 🗑️ rouge sur le dernier batch
   (fbc362b5-... 2026-05-30 13:44, 12 fiches)
3. Confirme la suppression (les 12 fiches actuelles sont supprimées)
4. Re-drag le PDF C:\\Users\\KElba\\Downloads\\Feuille de paie 2026-05.pdf
5. Cette fois tu auras **13 fiches** dont 2 pour Lina Akhechaa :
   - La plus grosse → primaire (payable immédiatement, QR généré)
   - La plus petite → secondaire scheduled J+6 (fond violet, ⏳)

═══════ LIENS DE TEST ═══════

🔗 Login                 : ${TUNNEL}/login
🔗 Fiches de paie        : ${TUNNEL}/admin/payslips
🔗 Liste employees       : ${TUNNEL}/planning/employees
🔗 Fiche Hidaya Elbazi   : ${TUNNEL}/planning/employees/3648378d-dd20-41b6-85f6-e85524e7ae21
🔗 Fiche K. Elkadiri     : ${TUNNEL}/planning/employees/7248a74b-d177-4d0e-87df-83a9ac927730
🔗 Régles légales        : ${TUNNEL}/admin/legal-rules
🔗 Aperçu contrat (test) : ${TUNNEL}/planning/employees/3648378d-dd20-41b6-85f6-e85524e7ae21/contract-preview?tpl=student

═══════ NOUVEAUTÉS À TESTER ═══════

✓ Filtres pills statut + employeur INSTANTANÉS sur /admin/payslips
✓ Card violette "Fiches à venir dans X jours" en haut (apparaît apres redrop avec 2 Lina)
✓ Style fond violet 60% opacity pour fiches secondaires scheduled
✓ KPI "Reste à payer" + "Déjà payé" avec € + nb personnes
✓ Banner rouge clignotant sur fiche employee si champs manquants
✓ Bouton conditionnel 🟢 vert / 🟠 orange / 🔴 rouge selon état fiche
✓ Bouton "Aperçu" du contrat (ouvre iframe avant envoi)
✓ Textarea editable du body mail dans dialog envoi
✓ Copie employeur automatique a hr@caftanfactory.com lors de l envoi
✓ Magic link redirige vers tunnel actif (pas localhost)
✓ Champs admin-only (date fin, hourly_rate) EXCLUS du mail au candidat
✓ Sélecteur Contrat = CDD/Étudiant uniquement (plus de CDI)
✓ Date naissance auto-prefill NRN (YY.MM.DD-)
✓ Temps plein auto 38h, temps partiel auto clamp [13,30]h

═══════ ÉTAT TUNNEL ═══════

Tunnel-keeper tourne en arrière-plan. Si tu reboot, relance via :
  cd C:\\Users\\KElba\\Documents\\GitHub\\Formulaire_candidats\\caftan-rh
  powershell -ExecutionPolicy Bypass -File scripts/tunnel-keeper.ps1

L URL est toujours à jour ici :
https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt

A +,
Claude
`;

const params = {
  to_email: TARGET, email: TARGET, user_email: TARGET, candidate_email: TARGET,
  to: TARGET, to_name: "Karim", name: "Karim", candidate_name: "Karim",
  from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
  subject, message: body, html_message: body.replace(/\n/g, "<br>"),
  body, html: body.replace(/\n/g, "<br>"), content: body,
};
const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
});
console.log(`Mail envoye : HTTP ${res.status}`);
if (res.status !== 200) console.error("Body:", (await res.text()).slice(0, 200));
console.log(`\nTunnel : ${TUNNEL}`);
console.log("\nPour la 13e fiche : supprime le batch via UI + re-drag le PDF.");
