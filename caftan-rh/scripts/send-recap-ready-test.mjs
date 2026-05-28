// Karim 2026-05-24 : mail "pret a tester" apres cross-map multi-terminaux,
// fixes auto-OUT, calcul prestations, et tests verifies.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const T = "https://caftanrh.loca.lt";

const body = `Salut Karim,

Tout est teste et pret a tester :

----- Fixes ce soir -----

1. Auto-OUT a la fermeture du site (au lieu de shift.end_time + 1h)
   - Tu as un IN sans OUT ? Le cron ferme automatiquement a close_time + 30min du site.
   - Pour Hafsa 18/05 (qui avait un IN 13:10 sans OUT) : auto-ferme a 19:40 (close Site A).
   - Badge orange "AUTO-OUT (corrigible)" visible sur la ligne.
   - Correction manuelle via /admin/presence > bouton Edit Override.

2. Bug dedupe auto-OUT par jour
   - Avant : on perdait les IN orphelins des jours precedents (seul le dernier IN par employee comptait).
   - Apres : dedupe par (employee, JOUR) -> tous les IN abandonnes sont detectes.
   - 41 IN scannes au dernier passage, tous fermes.

3. Page Prestations corrigee
   - Affichage des pointages HORS shift planifie (etaient invisibles avant).
   - KPI "Heures effectuees" inclut tout (shifts + hors planning).
   - Sub-text "dont X hors planning" en jaune.
   - Shifts FUTURS exclus du total planifie (sinon comptait des heures fictives).

4. Cross-mapping multi-terminaux (NOUVEAU, A VALIDER)
   - But : si une employee est enrolee sur plusieurs terminaux, ses heures sont consolidees sous le meme employee_id dans Prestations.
   - 5 mappings cross-terminaux ont ete crees automatiquement (a valider) :
     ${[
       ["Aya", "Pointage C et F", "aya guedoura"],
       ["El Bertitan Lina", "Pointage C et F", "Lina"],
       ["Ibtissem Benoukhita", "Pointage E", "ibtissam"],
       ["Omaima Ouahi", "Pointage C et F", "omaima"],
       ["Salima Alaoui", "Pointage E", "salma"],
     ].map(([e, d, n]) => `        • ${e.padEnd(22)} -> ${d.padEnd(20)} "${n}"`).join("\n")}
   - 1 mapping erroné supprime apres ton feedback : Hafsa Imachaal -> "Hafida" (FAUX)
   - Reponds "OK X" ou "NOK X" pour chacun et je nettoie en consequence.

5. Cron keeper local
   - Tourne en background, poll Tuya + auto-OUT toutes les 5 min.
   - Plus de presents fantomes accumules.

6. Click nom employe -> Page Prestations
   - PARTOUT (admin/presence, admin/tuya/logs, planning/employees) le nom est BLEU et clicable vers /prestations.

----- Etat verifie en BD (mai 2026) -----

Heures travaillees par employee (mai 1-24) :
   Keltoum El Mrabet    : 58.32h sur 6 jours
   Selma Maissa         : 56.16h sur 6 jours
   El Bertitan Lina     : 48.44h sur 5 jours
   Sanae Asaidi         : 48.09h sur 5 jours
   Hafsa Imachaal       : 43.10h sur 5 jours
   Rekimi Doha          : 36.97h sur 4 jours
   Omaima Ouahi         : 24.91h sur 4 jours
   Ibtissem Benoukhita  : 20.83h sur 2 jours
   Souad El Aissaouy    : 19.68h sur 2 jours
   Salima Alaoui        : 19.59h sur 2 jours

Presents actuellement : 0 (auto-OUT a tout ferme).

----- Limitation importante -----

L API Tuya ne retient que ~7 jours d historique. Events disponibles : 19/05 -> 24/05.
Avant le 19/05 : seulement les saisies manuelles existantes (16 events source=web pour les 11-13/05).
Si tu veux completer du 1er au 18 mai, il faut saisir manuellement via /admin/presence ou un import CSV.

----- Deep links a tester -----

• Page d accueil      : ${T}
• Presence live       : ${T}/admin/presence (0 present attendu)
• Prestations Keltoum : ${T}/planning/employees/1b2163a3-5e1d-4bfa-acb8-b21685fe4dc8/prestations?view=month
• Prestations Hafsa   : ${T}/planning/employees/b69ba2a4-cbf3-4f0c-bef3-aae5fdcc6706/prestations?view=month
• Logs Tuya           : ${T}/admin/tuya/logs
• Empreintes Tuya     : ${T}/admin/tuya/users
• Terminaux Tuya      : ${T}/admin/tuya/devices

----- Action immediate -----

A. Valide ou refuse les 5 cross-mappings ci-dessus (point 4)
B. Ouvre /planning/employees/<id>/prestations?view=month pour 1-2 employees, controle les heures
C. Si une heure ou un OUT auto est incorrect : Edit Override via /admin/presence

A demain pour la suite,
Claude
`;

const params = {
  service_id: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
  template_id: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID,
  user_id: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY,
  accessToken: process.env.EMAILJS_PRIVATE_KEY,
  template_params: {
    to_email: "elbazikarim@gmail.com",
    to_name: "Karim",
    subject: "CaftanRH — Pret a tester (cross-map + auto-OUT + Prestations)",
    message: body,
  },
};

const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", origin: "http://localhost" },
  body: JSON.stringify(params),
});
console.log("Status:", res.status);
console.log("Body:", await res.text());
