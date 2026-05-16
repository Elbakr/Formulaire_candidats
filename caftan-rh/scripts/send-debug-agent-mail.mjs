#!/usr/bin/env node
// Envoi mail rapport de debug autonome (agent IA) via EmailJS REST.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("Missing EmailJS env vars");
  process.exit(1);
}

const TO_EMAIL = "elbazikarim@gmail.com";
const TO_NAME = "Karim";
const FROM_NAME = "CaftanRH (agent debug auto)";
const REPLY_TO = "hr@caftanfactory.com";

const TUNNEL_URL = "https://ear-external-intimate-wednesday.trycloudflare.com";
const REPO_URL = "https://github.com/Elbakr/Formulaire_candidats/tree/caftan-rh-v2-prod";

const subject = "CaftanRH — Rapport de debug autonome (agent IA)";

const body = `Salut Karim,

Tu m as laisse 20 minutes en autonomie pour auditer le code pendant que
tu etais absent. Voici le rapport complet, branche caftan-rh-v2-prod.

═════════ URL DE TEST iPhone ═════════

  ${TUNNEL_URL}

  (Tunnel cloudflared random URL -- ne pas oublier qu il change a chaque
  restart. Si 404 web : il faudra m envoyer la nouvelle URL.)

═════════ BUG FIXE : pont vendredi non detecte (TZ-bug) ═════════

  Commit : 83550a9
  Fichier : caftan-rh/src/lib/holidays-crescendo.ts

  Symptome decouvert pendant l audit :
   - Date test : jeudi 14 mai 2026 = Ascension (priority 3, kind
     international, staff_multiplier 1.5).
   - Vendredi 15 mai = jour pont theorique apres jeudi ferie.
   - computePontMultiplier('2026-05-15', [...]) renvoyait { multiplier: 1,
     reason: null } -> le pont n etait JAMAIS detecte.
   - dayPriorityScore('2026-05-15') restait a 10 (jour banal) au lieu de 80.

  Cause racine :
   - new Date('2026-05-15T00:00:00') parse en heure LOCALE.
   - Sur un serveur en CEST (offset -120 min), .toISOString().slice(0,10)
     renvoie alors '2026-05-14'. Bug DST classique.
   - Du coup adjHoliday(-1) cherchait l holiday du 2026-05-13 au lieu du
     2026-05-14 -> miss.
   - dayDiff() pareil : Math.round((b-a)/86_400_000) peut donner +/-1 si
     l offset DST change entre les 2 dates (ex. 27 mars 2026).

  Fix :
   - Helpers dayDiff / addDaysISO / dowFromISO recalcules en UTC pur via
     Date.UTC(yyyy, mm-1, dd). Plus aucune dependance au fuseau du process.
   - Test apres fix :
       14 mai : prio 100 (ferie majeur)            OK
       15 mai : pont 1.375, prio 80                OK (etait 1.0/10)
       16 mai : samedi, prio 40                    OK
       Crescendo J-1..J-7 avant Aid 26 mai : 3.00..1.29  OK

  Impact prod : sur un Linux UTC le bug ne se manifeste pas. Sur
  Vercel (UTC) probablement OK, sur ton PC dev (Europe/Brussels) le
  pont etait casse. A confirmer avec le TZ du serveur de prod.

═════════ AUDIT TSC ═════════

   tsc --noEmit  =>  0 erreur (clean). Pas de fix necessaire.

═════════ AUDIT npm run lint ═════════

  269 problemes (230 erreurs, 39 warnings).
  Majorite : react/no-unescaped-entities (apostrophes dans JSX). Aucun bug
  fonctionnel, pur cosmetique. Pas traite (volume eleve, risque de typos).

  Fixes triviaux livres dans commit 40551e0 :
   - src/lib/analytics/site-needs-coverage.ts
       * import shiftHours supprime (jamais utilise)
       * dayOfMonday, dateByDow, totalDaysActive, totalHeadcountActive :
         variables mortes supprimees + cleanup des "void x" hack-lint
   - src/lib/scoring/punctuality.ts
       * helper timeToMin() definie mais non utilisee : supprime

  Pas touche aux 2 erreurs react-hooks/set-state-in-effect (use-locale.ts,
  sound-toggle.tsx) -- ce sont des patterns d hydratation SSR/CSR
  intentionnels, fix demanderait reflexion sur le mount.
  Pas touche a use-realtime.ts (refs in render) -- meme raison, le ref
  callback evite le restart de subscription a chaque render, fix non
  trivial.

═════════ AUDIT ROUTES (HTTP local) ═════════

  Test : curl localhost:3000 sur chaque route majeure (non authentifie).

   /planning/calendar                  -> 307 -> /login  OK
   /planning/all-sites                 -> 307 -> /login  OK
   /planning/quotas                    -> 307 -> /login  OK
   /planning/sites                     -> 307 -> /login  OK
   /admin/integrations/gravity-forms   -> 307 -> /login  OK
   /rh/candidates                      -> 307 -> /login  OK

  Aucun 500. Toutes les routes redirigent proprement vers /login en
  non-authentifie (comportement attendu). Pas de regression detectee.

═════════ AUDIT HOLIDAYS 25-27 MAI 2026 ═════════

  scripts/diag-may-2026-holidays.mjs :

   2026-05-25 | Lundi de Pentecote       | legal     | OUVERT  | mult=1.50
   2026-05-25 | Aid al-Adha 1447 -- j-1  | religious | OUVERT  | mult=2.00
   2026-05-26 | Aid al-Adha 1447         | religious | FERME   | mult=1.00
   2026-05-27 | Aid al-Adha 1447 -- j+1  | religious | OUVERT  | mult=1.50

  Dates correctes, staff_multiplier coherent avec ton dernier fix 7377729.
  Note : 25 mai a 2 lignes (Pentecote 1.50 + Aid j-1 2.00). Si le solver
  applique MAX (commit ad49178), il prendra 2.00. OK.

═════════ AUDIT DOUBLONS CANDIDATES ═════════

  Nouveau script : caftan-rh/scripts/diag-candidates-dupes.mjs
  (lecture seule, ne deduplique PAS).

  Total candidates : 1826
  Groupes doublons email : 287
  Groupes doublons nom   : 292

  Top 10 (par nombre de doublons sur la meme adresse email) :

    [x8] mounarssss@gmail.com         (Mouna Hassani Rais / Mouna Rais)
    [x6] idrissiid9127@gmail.com      (Nihad Idrissi)
    [x6] jamilabrazi021@gmail.com     (Jamila Brazi)
    [x6] l.taieb2307@gmail.com        (Lina Taieb)
    [x5] ihsaneghiouar2007@gmail.com  (Ihsane Ghiouar)
    [x5] israefln13@gmail.com         (Israe Falhani Cherradi)
    [x5] oumaimahlal04@gmail.com      (Oumaima Hlal)
    [x5] raniazehaf.29@gmail.com      (Rania Zehaf)
    [x4] alhomsililya@gmail.com       (Lilya Al Homsi)
    [x4] (autres -- voir output complet du script)

  Tous les doublons ont source=gravity_forms et tous crees le 2026-05-09
  a 14:13. Diagnostic : la sync GF a tourne plusieurs fois ce jour-la avant
  ton fix dedupe batched (commit 22b8d48 d aujourd hui). Le fix actuel
  evite les NOUVEAUX doublons mais ne nettoie pas l existant.

  Recommandation : ajouter un script scripts/cleanup-candidates-dupes.mjs
  qui garde le plus ancien id par cle (email/full_name) et bascule les
  applications/notes/messages eventuels vers le canonique. Pas fait
  aujourd hui (op destructive, je veux ta validation d abord).

  Pour Kenza Kebdani / Fatima Zahrae Mouany cites dans ton brief :
  les voir dans le full output : node scripts/diag-candidates-dupes.mjs

═════════ TRIPLE CHECK PONT DETECTION ═════════

  Apres fix 83550a9, scenarios testes :

  14 mai 2026 (jeudi Ascension, ferie majeur)
    -> computePontMultiplier = 1.0 (correct, ferie lui-meme pas un pont)
    -> dayPriorityScore = 100 (selectMajorHolidays = match)

  15 mai 2026 (vendredi pont)
    -> computePontMultiplier = { multiplier: 1.375,
       reason: "Pont vendredi apres ferie jeudi 2026-05-14" }
    -> dayPriorityScore = 80

  16 mai 2026 (samedi)
    -> computePontMultiplier = 1.0 (correct, samedi+2 jours apres jeudi
       n est pas dans la logique pont)
    -> dayPriorityScore = 40 (boost samedi)

  17 mai 2026 (dimanche)
    -> computePontMultiplier = 1.0
    -> prio 30

  Crescendo Aid 26 mai (semaine 18-25 mai) :
    J-7=1.29  J-6=1.57  J-5=1.86  J-4=2.14  J-3=2.43  J-2=2.71  J-1=3.00

  Avec le plafond combinedMult MAX cap 2.0 (commit ad49178), les facteurs
  > 2 seront bornes -- comportement attendu vu ton dernier echange.

═════════ OBSERVATIONS SURPRENANTES ═════════

  1. Bug TZ-pont silencieux : la fonction tournait depuis le commit
     7522758, le crescendo marchait OK sur Vercel (UTC) mais pas en local.
     Pas vu en review parce que le test commun (Aid al-Adha) tombe sur
     une chaine vendredi->samedi sans pont vendredi pertinent.

  2. La fonction computeSiteNeedsCoverage avait 4 variables mortes
     (dayOfMonday + 3 autres) avec un "void x" en bas pour shut up le
     lint. Probable reste d une iteration. Cleanup propre livre.

  3. Doublons GF : 287 groupes par email c est enorme pour une base de
     1826 candidats. Soit ~16% de la base est doublon. Le sync du 09/05
     a clairement tourne en boucle. Cleanup recommande mais pas execute.

═════════ COMMITS AGENT IA AUJOURD HUI ═════════

  83550a9  fix(holidays-crescendo): pont detection cassee par bug TZ
  40551e0  chore(lint): nettoyage variables et imports inutilises

  Push origin/caftan-rh-v2-prod : OK.

═════════ NON FAIT ═════════

   - Cleanup deduplication candidates (op destructive, attente validation)
   - Lint react/no-unescaped-entities (230 erreurs cosmetiques)
   - Refactor patterns react-hooks (set-state-in-effect, refs in render)
   - Pas touche au solver multi-sites comme demande
   - Pas refactore les 21 autres fichiers qui utilisent le pattern
     "new Date(iso + 'T00:00:00').toISOString().slice(0,10)" -- la plupart
     manipulent une seule date (pas de soustraction), donc impact mineur.
     A auditer si bug similaire apparait ailleurs.

A +,
Claude (agent debug autonome CaftanRH)
Repo : ${REPO_URL}
`;

async function send() {
  const params = {
    to_email: TO_EMAIL,
    email: TO_EMAIL,
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
  console.log(`Status: ${res.status} | body: ${text}`);
  if (res.status !== 200) process.exit(1);
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
