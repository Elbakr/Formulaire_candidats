#!/usr/bin/env node
// Envoi mail recap session 15/05 (validation workflow + bulk-edit + mult 1.0).
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
const FROM_NAME = "CaftanRH";
const REPLY_TO = "hr@caftanfactory.com";

const TUNNEL_URL = "https://although-axis-deputy-applications.trycloudflare.com";
const REPO_URL = "https://github.com/Elbakr/Formulaire_candidats/tree/caftan-rh-v2-prod";

const subject = "CaftanRH — Session 15/05 : validation workflow + bulk-edit + mult x1.0";

const body = `Salut Karim,

Session 15/05 -- 5 chantiers livres sur la branche caftan-rh-v2-prod.
Commits da92cfb -> 7a153d7. Migration DB 20260620000240 appliquee
(planning_validation_runs + planning_validation_responses).

═════════ URL DE TEST iPhone ═════════

  ${TUNNEL_URL}

  Cloudflared HTTP2, verifie HTTP 200 a l envoi du mail.

═════════ CHANTIERS LIVRES ═════════

[1] OT MULTIPLIER x1.0 (commit d392bb4)
    Ajout de x1.0 dans la liste des multiplicateurs en plus de x1.25/x1.5/x2.
    Cas d usage : tracer une heure comme "au-dela du quota contractuel"
    SANS appliquer de premium de paie -- depasse pour raison interne
    (compensation prevue ailleurs, recup, etc.).
    UI : ShiftDialog + GenerateSiteButton case-par-case.

[2] PAGE "DONNEES SOLVER" -- edition rapide masse (commit 1091535)
    /planning/employees/bulk-edit -- une ligne par employe actif avec
    7 colonnes editables d un coup d oeil :
     - Wk hours, contrat (CDI/CDD/Etudiant/Interim)
     - Pause par defaut (minutes)
     - OT eligible (checkbox)
     - Jours OFF fixes (7 toggles D/L/M/M/J/V/S)
     - Sites preferes (chips clickables avec code couleur)
     - Sites bloques (chips, exclusif des preferes)
     - Statut (actif/conge/archive)
    Bouton Save par ligne, enabled si dirty. Bandeau jaune en haut
    si lignes en cours de modif + "Tout annuler".
    Lien depuis /planning/employees ("Donnees solver").

[3] VUE D ENSEMBLE MULTI-SEMAINES (commit 2ee0613)
    /planning/all-sites accepte ?weeks=1|2|4|12. Pour N>1, rend N grilles
    empilees avec un header par semaine (numero/N + dates + lien Zoom).
    La semaine courante est mise en evidence en or. Filtre sites avec
    shifts applique par semaine. Nav prev/today/next preserve weeks=N.

[4] VALIDATION PLANNING -- workflow complet (commit 1fde086)

   * DB (migration 20260620000240) :
     - planning_validation_runs : un run par (semaine, site optionnel)
       avec was_mandatory (auto-detect rush), was_bypassed, bypass_reason
     - planning_validation_responses : reponse par (run, employe) avec
       cancelled_after_validation pour traquer les annulations post-acceptation
     - RLS : RH/admin gerent, employes voient leurs propres reponses

   * DETECTION RUSH AUTO (lib/validation/rush-detection.ts) :
     1. Ferie international ou shops_closed dans la semaine
     2. Ferie le lundi/vendredi (pont weekend) ou mardi/jeudi (pont potentiel)
     3. 15 derniers jours du Ramadan (seasonal_events kind/label "ramadan")
     4. Vacances scolaires (seasonal_events kind/label contenant
        "scolaire"/"vacances"/"school_break"/"ecole")

   * UI RH (/planning/validation, dans la nav GestiPlanning) :
     - Tableau "4 prochaines semaines" : detection rush + statut run existant
     - Formulaire creation run (semaine, deadline optionnelle, bypass)
     - Liste runs avec stats (acceptes/refuses/en attente/annules)
     - Cloture manuelle d un run

   * UI EMPLOYE (/me/planning, banner en tete) :
     - Banner Active/Accepted/Refused/Cancelled
     - Validation en 1 clic + champ note pour refus
     - Apres acceptation : bouton "Annuler ma validation" avec raison
       obligatoire (impact direct score)
     - Mention explicite "ton score de fiabilite en tiendra compte"

[5] SCORING -- fiabilite validation (commit 7a153d7)
    Nouveau lib/scoring/validation-reliability.ts :
     - accepted : validations honorees
     - cancelled_after_validation : annulations post-acceptation
       (= parole donnee, pese lourd)
     - refused : refus directs (= transparence, pese leger)
     - honored_pct : accepted / (accepted + cancelled)
     - score : 100 - (cancelled_pct * 0.5 + refused_pct * 0.05)
       Annulation post-acceptation pese 10x plus qu un refus direct.
     - band : exemplary>=95 / ok>=80 / attention>=60 / danger<60
    Affichage /scoring : 4eme ligne "Fiabilite validation : XX%" a cote
    de la ponctualite. Tooltip detaille.
    Hors global_score officiel pour l instant (idem ponctualite, necessite
    migration de la fonction PL/pgSQL recompute_all_employee_metrics).

═════════ PROCEDURE DE TEST iPhone ═════════

  1. Safari iPhone : ${TUNNEL_URL}
  2. Login admin
  3. /planning/employees/bulk-edit -> editer 1-2 employes (OT, jours OFF,
     sites preferes), verifier le save par ligne
  4. /planning/calendar -> creer un shift, verifier que x1.0 apparait
     dans le selecteur "Heures sup"
  5. /planning/all-sites?weeks=4 -> 4 grilles empilees, badges couverture
  6. /planning/validation -> creer un run pour la semaine prochaine,
     verifier la detection rush automatique sur les semaines a venir
  7. /me/planning (depuis le compte d un employe) -> banner de validation,
     accepter puis tester "Annuler ma validation"
  8. /scoring -> verifier la 4eme ligne "Fiabilite validation"

═════════ POINTS D ATTENTION ═════════

  ⚠ Notifications push aux employes lors de creation de run : pas envoye
    pour l instant. Si tu veux pousser, ajoutera dans un commit suivant
    (le banner s affiche en revisite naturelle de /me/planning).

  ⚠ Penalite score "no-show" (employe valide mais ne pointe pas le jour J)
    pas encore implementee. Pour l instant, la penalite est sur ANNULATION
    explicite par l employe. La detection automatique no-show vs shift
    pourra venir dans un prochain commit (en combinant clock_entries vs
    shifts pour la fenetre de la validation).

  ⚠ Equilibrage cross-sites au solver : toujours pas fait, comme indique
    dans la session precedente.

═════════ RECAP COMPLET DEPUIS HIER (14/05) ═════════

Total : ~12 commits sur caftan-rh-v2-prod en 2 sessions :
 - Bug OT (split auto au quota) : fd7862e + 3f461ef
 - Vue d ensemble badge couverture : aee7205
 - Sites navigation inline : 04bf297
 - Page Quotas timeline + KPI : eb24186
 - Ponctualite scoring : aa20128
 - Crescendo J-7 fetes : 7522758
 - OT multiplier x1.0 : d392bb4
 - Bulk-edit donnees solver : 1091535
 - Multi-semaines all-sites : 2ee0613
 - Validation workflow complet : 1fde086
 - Fiabilite validation scoring : 7a153d7

Repo : ${REPO_URL}

A +,
Claude (CaftanRH builder)
`;

async function send() {
  const params = {
    to_email: TO_EMAIL, email: TO_EMAIL, user_email: TO_EMAIL,
    candidate_email: TO_EMAIL, to: TO_EMAIL,
    to_name: TO_NAME, name: TO_NAME, candidate_name: TO_NAME,
    from_name: FROM_NAME, reply_to: REPLY_TO,
    subject, message: body,
    html_message: body.replace(/\n/g, "<br>"),
    body, html: body.replace(/\n/g, "<br>"), content: body,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({
      service_id: SERVICE_ID, template_id: TEMPLATE_ID, user_id: PUBLIC_KEY,
      template_params: params,
    }),
  });
  console.log(`Status: ${res.status} | body: ${await res.text()}`);
}
send().catch((e) => { console.error("Erreur:", e.message); process.exit(1); });
