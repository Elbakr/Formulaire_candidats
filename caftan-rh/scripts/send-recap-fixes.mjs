// Karim 2026-05-24 21:40 : recap final des fixes ce soir + URL tunnel + deep
// links vers les rubriques concernees.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

if (!SERVICE || !TEMPLATE || !PUBLIC_KEY) {
  console.error("EmailJS env manquant (SERVICE/TEMPLATE/PUBLIC_KEY)");
  process.exit(1);
}

const TUNNEL = "https://caftanrh.loca.lt";

const body = `Salut Karim,

Le tunnel public est de nouveau actif sur subdomain stable :

  ${TUNNEL}

(localtunnel keeper relance — l URL ne changera plus a chaque restart, ouvre dans Safari iPhone et clique "Click to continue" la 1ere fois pour valider)

----- Fixes ce soir -----

1. Bug 5 presents fantomes : RESOLU
   - 5 IN abandonnes du 19-23 mai sans OUT detectes
   - Auto-OUT lance manuellement : 5 fermes
   - Cause : empreintes Pointage A enrolees ce soir mais events historiques skipped (slot non mappe avant le mapping)

2. Auto-OUT corrige
   - Avant : auto-OUT a shift.end_time + 1h SI dans la fenetre +-30min site
   - Apres : auto-OUT a close_time du site + 30 min, peu importe l heure
   - Resultat : 3 IN restants fermes immediatement

3. Navigation enrichie
   - "Prestations employes" ajoute dans la section Reporting de la nav
   - Acces direct : ${TUNNEL}/planning/employees

4. Click nom employe -> vue prestations
   - /admin/presence : click sur nom -> /planning/employees/[id]/prestations?view=week
   - /admin/tuya/logs : click sur nom mappe -> idem

5. Backfill 30 jours (mai entier) execute
   - 128 events fetched, 12 inserted, 64 skipped (slots non mappes encore)
   - Continue de mapper via /admin/tuya/logs pour rattraper les 64 evens

6. Bug duplicate key contrainte unique : FIXE
   - quickEnrollAction et createEmployeeAndEnrollAction passent en UPSERT
   - Tu peux ré-enroler un employe sur un nouveau slot sans erreur

----- Deep links a tester -----

* Presence live (qui est clocke-in maintenant) :
  ${TUNNEL}/admin/presence

* Logs Tuya (events bruts par terminal) :
  ${TUNNEL}/admin/tuya/logs

* Empreintes Tuya (mappings tuya_user_id ↔ employe) :
  ${TUNNEL}/admin/tuya/users

* Terminaux Tuya (devices configures) :
  ${TUNNEL}/admin/tuya/devices

* Liste employes -> click sur un employe -> bouton "Prestations" :
  ${TUNNEL}/planning/employees

* Prestations Keltoum (exemple - vues jour/sem/mois) :
  ${TUNNEL}/planning/employees/1b2163a3-5e1d-4bfa-acb8-b21685fe4dc8/prestations?view=week

----- Actions restantes pour toi -----

A. Mapper les ~9 empreintes restantes via /admin/tuya/logs (Pointage A)
   Le slot apparait dans l unlock event. Clique "Non mappe" -> choisis l employe -> upsert.

B. Relance "Backfill 7j -> presences" apres chaque vague de mappings pour
   rattraper l historique.

C. En production sur Vercel, ajoute dans vercel.json :
   {
     "crons": [
       { "path": "/api/cron/tuya-poll",     "schedule": "*/5 * * * *" },
       { "path": "/api/cron/tuya-auto-out", "schedule": "*/30 * * * *" }
     ]
   }
   + CRON_SECRET configure dans Vercel env.

A demain,
Claude
`;

const params = {
  service_id: SERVICE,
  template_id: TEMPLATE,
  user_id: PUBLIC_KEY,
  accessToken: PRIVATE_KEY,
  template_params: {
    to_email: "elbazikarim@gmail.com",
    to_name: "Karim",
    subject: "CaftanRH — URL tunnel stable + fixes ce soir",
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

if (res.status !== 200) {
  console.log("\n=== BACKUP CONTENU MAIL (a copier-coller si EmailJS fail) ===");
  console.log(body);
}
