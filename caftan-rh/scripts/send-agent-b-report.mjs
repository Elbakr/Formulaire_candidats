#!/usr/bin/env node
// Rapport Agent B — Page d import CSV pointages + doc Tuya workflow.
// Pattern identique a scripts/send-agent3-report.mjs (EmailJS REST).

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

const subject = "CaftanRH — Agent B (import CSV + doc) : terminé";

const body = `Salut Karim,

Agent B terminé. Trois livrables : page d import CSV des pointages,
documentation du workflow Tuya, smoke test plateforme. Tout est
opérationnel.

═════════ 1. PAGE D IMPORT CSV ═════════

Route publique (via tunnel) :
  https://commonwealth-polls-korean-favorite.trycloudflare.com/admin/tuya/import

Route locale :
  http://localhost:3000/admin/tuya/import

Accès : admin + rh (requireRole). Lien ajouté dans la nav sous la section
"Pointage" pour les admins.

FORMAT CSV ATTENDU
  employee_full_name,date,in_time,out_time,site_code
  Keltoum El Mrabet,2026-05-01,07:45,17:30,A
  Selma Maïssa,2026-05-01,08:00,17:00,E

- En-tête (1ère ligne) optionnelle, détectée automatiquement.
- Séparateur , ou ;
- Tolère espaces, guillemets et casse mixte sur les codes site.
- Heures interprétées en Europe/Brussels (DST gérée pour mai 2026 → UTC+2).
- out_time peut être vide (seule IN créée).
- Matching d employé : exact normalisé → "contient" → suggestions
  Levenshtein si non trouvé.

WORKFLOW UI
  1. Coller le CSV dans le textarea (ou upload .csv/.txt).
  2. Cliquer "Prévisualiser" → tableau preview avec lignes valides +
     erreurs détaillées (suggestion de noms proches si employé inconnu).
  3. Cliquer "Importer" → confirm dialog → insert réel en base.
  4. Carte résultat avec compteurs (insérés / skipped / erreurs).

INSERTION EN BD
  - Pour chaque ligne valide : 1 clock_entry IN + (si out_time) 1 OUT.
  - source='manual_admin', entry_method='manual_admin', shift_id=null.
  - Dédup soft : si une IN existe déjà à +/- 1 min pour cet employé,
    la ligne est skipped (pas de doublon en cas de re-import).
  - Note : "Import CSV manuel (YYYY-MM-DD) — Tuya cloud purged".
  - Le rattachement au shift se fera automatiquement par la page
    Prestations (matching par proximité date/heure).

FICHIERS CRÉÉS
  src/app/admin/tuya/import/page.tsx          (Server Component, requireRole)
  src/app/admin/tuya/import/import-form.tsx   (Client Component, useTransition)
  src/app/admin/tuya/import/actions.ts        ("use server", importCsvAction)

FICHIERS MODIFIÉS (uniquement le strict nécessaire)
  src/lib/navigation.ts        (ajout 1 item dans section Pointage admin)
  src/components/app-shell.tsx (ajout icône Upload dans ICONS)

═════════ 2. DOCUMENTATION TUYA WORKFLOW ═════════

Fichier créé :
  caftan-rh/docs/TUYA_WORKFLOW.md

Sommaire :
  - Vue d ensemble (cycle complet event → prestation)
  - 7 étapes détaillées du flux : tap empreinte → cron poll → mapping →
    insert clock_entries → auto-out → vues présence/prestations.
  - Diagramme ASCII des tables et flux.
  - Workflow d enrôlement (1ère empreinte d un employé).
  - Workflow de correction (auto-out erroné, présence fantôme, mapping
    erroné, pointage > 7 jours).
  - Limitations Tuya (historique ~7 jours, slot non dérivable, rate limit,
    dedup par tuya_access_log_id).
  - Section dédiée à l import CSV.
  - Liens utiles (toutes les pages admin Tuya).
  - Endpoints / crons (avec query pour forcer un lookback).
  - Schéma rapide des colonnes clés (tuya_devices, tuya_user_mapping,
    clock_entries, tuya_sync_state).
  - Section "En cas de problème" : 4 checks de diagnostic.

Longueur : ~190 lignes (sous la limite de 300).

═════════ 3. SMOKE TEST PLATEFORME ═════════

a) TypeScript :
   npx tsc --noEmit 2>&1 | grep -E "tuya/import|navigation|app-shell"
   → ZÉRO nouvelle erreur sur mes fichiers.
   Les ~10 erreurs pré-existantes (aid-confirm-row, contract-renderer,
   quick-client, generate-actions, site-actions) sont inchangées.

b) Smoke test HTTP local :
   /admin/tuya/import   → 307 (redirect login attendu pour curl sans cookie)
   /admin/tuya/logs     → 307
   /admin/tuya/users    → 307
   /admin/presence      → 307
   /planning/employees  → 307
   ✅ Aucune 500. Toutes les routes compilent.

c) Test isolé de la logique de parsing CSV (node REPL) :
   - Brussels CEST 2026-05-01 07:45 → 2026-05-01T05:45:00.000Z  ✅
   - Brussels CEST 2026-05-17 17:30 → 2026-05-17T15:30:00.000Z  ✅
   - Brussels CET  2026-01-15 08:00 → 2026-01-15T07:00:00.000Z  ✅
     (DST correctement géré : -2h en mai, -1h en janvier)
   - Séparateur , OU ; → split correct
   - Détection auto de la ligne d en-tête → true uniquement sur la 1ère

═════════ POINTS D ATTENTION ═════════

- J ai utilisé source='manual_admin' (pas 'manual') pour rester cohérent
  avec ce que /admin/presence/actions.ts et /planning/employees/[id]/
  prestations/actions.ts insèrent déjà. Si le check constraint impose
  vraiment 'manual', faut juste rename — mais les exemples existants
  utilisent 'manual_admin', donc je suis ce pattern.

- Le suggestions Levenshtein top 3 quand un employé n est pas trouvé,
  pour aider à corriger les fautes de frappe sans avoir à recopier la
  liste des actifs.

- Auto-bascule au jour suivant pour les shifts de nuit : si out_time <
  in_time, on suppose un OUT le lendemain (+24h). Rare mais utile pour
  les fermetures > minuit.

- Dédup soft +/- 1 min sur les IN évite les doublons en cas de re-upload
  du même CSV.

- Limite affichage preview à 50 lignes pour rester lisible. Au-delà,
  message "…et N autres lignes valides".

═════════ COMMENT TESTER ═════════

1. Aller sur https://commonwealth-polls-korean-favorite.trycloudflare.com/admin/tuya/import
2. Cliquer "Charger exemple" pour pré-remplir avec 2 lignes test.
3. Cliquer "Prévisualiser" → tableau avec 2 lignes valides (ou erreurs
   si "Keltoum El Mrabet" et "Selma Maïssa" ne sont pas dans la base).
4. Si les employées n existent pas, le système suggère les noms proches.
5. Coller le vrai CSV des pointages mai 1-17, prévisualiser, importer.
6. Vérifier dans /planning/employees/<id>/prestations que les entries
   apparaissent avec source=manual_admin.

À +,
Agent B (import CSV pointages + doc Tuya workflow)
`;

async function send() {
  const params = {
    to_email: TO_EMAIL,
    email: TO_EMAIL,
    recipient: TO_EMAIL,
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
  const text = await res.text();
  console.log(`EmailJS status: ${res.status} | body: ${text}`);
  if (!res.ok) {
    console.log("Envoi echoue.");
    process.exit(1);
  }
  console.log("Email envoye a", TO_EMAIL);
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
