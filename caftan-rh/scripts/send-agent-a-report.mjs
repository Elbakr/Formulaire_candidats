// Karim 2026-05-24 : recap Agent A (correction inline AUTO-OUT + alertes HR).

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

const TUNNEL = "https://commonwealth-polls-korean-favorite.trycloudflare.com";
const DEMO_EMP = "1b2163a3-5e1d-4bfa-acb8-b21685fe4dc8";

const body = `Salut Karim,

Agent A termine -- correction inline AUTO-OUT + alertes HR sur la page Prestations.

----- Fonctionnalites livrees -----

1. Edit inline AUTO-OUT depuis Prestations
   - Sur /planning/employees/[id]/prestations chaque ligne avec un AUTO-OUT
     affiche maintenant un petit bouton "Modifier" a cote du badge orange
     "AUTO-OUT (corrigible)".
   - Click -> Dialog avec input time (HH:MM) prerempli sur l heure auto.
   - "Enregistrer" -> server action correctClockOutAction() qui :
       * verifie le role (admin/rh uniquement)
       * met a jour clock_entries.occurred_at
       * passe auto_clocked_out=false (devient OUT manuel)
       * trace "OUT corrige manuellement le <date> par <auteur>" dans notes
       * revalidatePath /planning/employees/[id]/prestations + /admin/presence
   - Securite : le bouton n apparait QUE si isAutoClosedOut===true ET role
     est admin ou rh (le manager voit le badge mais pas le bouton).

2. Alertes HR sur auto-OUT (cron tuya-auto-out)
   - Verifie : la logique point 7 du cron insere bien des notifications
     pour les admin/rh quand closed.length > 0 :
       * kind="tuya_auto_close"
       * title="Auto-OUT pointage : N employe(s)"
       * body listant les noms (max 5 + "(+N autres)")
       * link="/admin/presence"
       * data={count, employees:[...]}
   - Test : curl -H "Authorization: Bearer \$CRON_SECRET" .../api/cron/tuya-auto-out
     -> {"ok":true,"scanned":41,"auto_closed":0,"skipped":0}
   - Aucune fermeture cette fois (les IN ouverts ne sont pas encore au-dela
     du close_time du site), donc pas de notif inseree. La logique est prete
     et se declenchera automatiquement lors du prochain auto-OUT.

----- Fichiers crees -----

- src/app/planning/employees/[id]/prestations/actions.ts
  (nouvelle server action correctClockOutAction)
- src/app/planning/employees/[id]/prestations/edit-clockout-button.tsx
  (Client Component, dialog + form HH:MM + sonner toast)
- scripts/send-agent-a-report.mjs (ce mail)

----- Fichiers modifies -----

- src/app/planning/employees/[id]/prestations/page.tsx
  * import du nouveau composant EditClockOutButton
  * recuperation du role via requireRole() pour calculer canEditAutoOut
  * ShiftRow recoit employeeId + canEditAutoOut en props
  * rendu conditionnel du bouton a cote du badge AUTO-OUT
- (pas de modif tuya-auto-out/route.ts : logique deja correcte au point 7)

----- Smoke test -----

* tsc --noEmit | grep "prestations|tuya|presence|app-shell|navigation" : 0 erreur
* GET /admin/presence              -> 307 (redirect login OK)
* GET /admin/tuya/logs             -> 307
* GET /admin/tuya/devices          -> 307
* GET /admin/tuya/users            -> 307
* GET /planning/employees          -> 307
* GET .../prestations?view=month   -> 307
  (toutes redirect vers login, aucune 500)
* Log dev server : pas de Uncaught / TypeError / FATAL cote serveur
  (les warnings "Router action dispatched before initialization" sont des
  messages browser dev de Next.js, non-bloquants)
* Cron tuya-auto-out : reponse OK sans erreur

Resume smoke test : tsc OK, all URLs 200/307, 0 erreur log.

----- Comment tester en live -----

URL deep (auto-login si deja connecte) :
${TUNNEL}/planning/employees/${DEMO_EMP}/prestations?view=month

Etapes :
1. Ouvrir l URL ci-dessus (vue Mois sur Keltoum)
2. Faire defiler les jours, chercher une ligne avec le badge orange
   "AUTO-OUT (corrigible)" (souvent les 19-23 mai d apres le recap precedent)
3. Cliquer sur le petit bouton "Modifier" a cote
4. Saisir la vraie heure de sortie (ex. 18:00) -> Enregistrer
5. Toast "OUT corrige" + la ligne se rafraichit : badge AUTO-OUT disparait,
   le OUT est maintenant un OUT manuel. Note d audit dans clock_entries.notes.

Si tu es admin/rh tu vois le bouton, si tu es manager tu vois juste le badge
sans pouvoir corriger (c est voulu : on garde la trace cote RH).

----- Actions restantes pour toi -----

A. Tester sur quelques lignes AUTO-OUT historiques (mai 2026) que la
   correction prend bien et que le total mensuel se met a jour.

B. Le declenchement effectif d une notif tuya_auto_close n a pas pu etre
   constate ce passage (aucun IN encore depassait le close_time). Au prochain
   tick cron qui ferme >= 1 IN, verifie que la cloche /api/notifications/feed
   te ramene bien une entry kind=tuya_auto_close cliquable vers /admin/presence.

C. Si tu veux que le manager puisse aussi corriger les auto-OUT (pas que
   admin/rh), me le dire -- je change la condition canEditAutoOut + l action
   server-side.

A demain,
Agent A (Claude)
`;

const params = {
  service_id: SERVICE,
  template_id: TEMPLATE,
  user_id: PUBLIC_KEY,
  accessToken: PRIVATE_KEY,
  template_params: {
    to_email: "elbazikarim@gmail.com",
    to_name: "Karim",
    subject: "CaftanRH — Agent A (correction inline + alertes HR) : terminé",
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
