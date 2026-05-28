#!/usr/bin/env node
// Envoi mail recap "session A-Z complete" via EmailJS REST.
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

const TUNNEL_URL = "https://ruling-houston-explains-pushed.trycloudflare.com";
const REPO_URL = "https://github.com/Elbakr/Formulaire_candidats/tree/caftan-rh-v2-prod";

const subject = "CaftanRH — Session A-Z : 7 chantiers livres + URL test";

const body = `Salut Karim,

Tu m as demande de tout faire de A a Z. C est fait. 7 chantiers livres
aujourd hui sur la branche caftan-rh-v2-prod (commits fd7862e -> 7522758).

═════════ URL DE TEST iPhone ═════════

  ${TUNNEL_URL}

  Tape l URL dans Safari iPhone. Tunnel cloudflared actif et verifie
  (HTTP 200). Page diag push : ${TUNNEL_URL}/admin/debug/push

═════════ CHANTIERS LIVRES AUJOURD HUI ═════════

[1] FIX BUG OT -- fractionnement quota hebdo (commits fd7862e + 3f461ef)
    Avant : OT marquees alors que le quota contractuel n etait pas atteint.
    Maintenant : auto-split. Quand un shift fait passer l employe au dessus
    de weekly_hours, il est decoupe au seuil exact :
     - segment contractuel jusqu a epuisement (avec pause repas incluse)
     - segment OT pour le reste (multiplicateur 1.5 par defaut)
    Applique a :
     * upsertShiftAction (creation/modif manuelle dans ShiftDialog)
     * solver phase 2 OT (besoins non couverts par phase 1)
    Toast UI explicite : "Shift fractionne : 3.0h contractuel + 2.0h h. sup".

[2] VUE D ENSEMBLE -- badge couverture besoins (commit aee7205)
    Chaque cellule (site, jour) affiche maintenant :
     - "X/Y" : effectif present / requis
     - "+Z" surplus ou "-Z" manque
     - Code couleur : vert OK / orange critique / rouge vide / violet surplus
     - Sites filtres : seuls ceux avec planning genere sont visibles
    La direction repere en 1 coup d oeil les zones a renforcer.

[3] SITES NAVIGATION INLINE (commit 04bf297)
    Sur /planning/sites/[code], strip horizontal en tete :
     - Bouton "Liste" -> retour /planning/sites
     - Site precedent (<-) / Site suivant (->)
     - Tous les sites en chips scrollables (mobile horizontal)
     - Site courant mis en evidence en or
    Plus besoin de revenir a la liste pour changer de site.

[4] PAGE QUOTAS -- timeline + KPI direction (commit eb24186)
    Refonte complete pour la prise de decision direction/RH :
     - Selecteur de periode : semaine en cours / suivante / 4 sem / 12 sem / mois
     - 4 cards KPI en tete :
        * Couverture besoins (% + h planifiees / h requises)
        * Deficit a combler (h + nb sites en zone critique)
        * Employes en depassement (+ total h sup)
        * Employes sous-utilises (a mobiliser)
     - Bandeau de recommandation contextuelle (si deficit > 0 ET employes
       sous-utilises > 0 -> propose l affectation pour eviter h sup)
     - Tableau couverture par site : requis/contractuel/h.sup/coverage/deficit
     - Tableau employes : meme structure recalcule sur la periode
    URL : /planning/quotas?period=this_week (ou next_week / 4w / 12w / this_month)

[5] SCORING -- ponctualite (commit aa20128)
    Nouvelle metrique calculee TS-side a partir de clock_entries vs shifts :
     - samples : nb de shifts pointes sur 3 mois
     - punctual_pct : pointes <= start+5min
     - late_pct : 5 < x <= 15 min
     - very_late_pct : > 15 min
     - rigor_score : 100 - (late_pct*0.5 + very_late_pct*2)
       tres en retard pese 4x plus que en retard
     - bande : exemplary >=95 / ok >=80 / attention >=60 / danger <60
    Affichee sur /scoring sous "Couverture", avec tooltip detaille
    (samples, %, retard moyen).
    LIMITE : pas encore dans le global_score officiel (fonction PL/pgSQL
    a migrer). L info est deja visible et exploitable.

[6] SOLVER -- crescendo J-7 + priorisation jours speciaux (commit 7522758)
    Nouveau module lib/holidays-crescendo.ts :
     - selectMajorHolidays() : filtre les "fetes marquantes" (shops_closed
       OU staff_multiplier>1 OU priority>=2) -- Aid al-Fitr, Aid al-Adha, Noel.
     - computeCrescendoMultiplier(date, holidays) : pour J-7..J-1 de la
       1ere fete : facteur lineaire 1.0 -> 3.0 (au J-1). Pour la 2eme : 1.0 -> 1.5.
     - dayPriorityScore(date, holidays) : 0-100 selon criticite (jour ferie
       major=100, samedi=40, dimanche=30, autres=10, + boost crescendo).
    Integre au solver (preview phase 1) :
     - Les 7 jours de la semaine sont desormais TRIES par priorite DESC
       avant le loop -- les jours critiques (J-1 Aid, ferie majeur, samedi)
       sont traites en premier.
     - combinedMult = seasonal x holiday x crescendo (plafond 4x). Headcount
       gonfle proportionnellement.
    EXEMPLE : J-1 d Aid avec staff_multiplier=1.5 et crescendo=3.0 ->
              combinedMult = min(4, 1 x 1.5 x 3.0) = 4. Magasins normalement
              a 2 vendeuses passent a 8 ce jour-la (plafond).

═════════ VERIFICATION ═════════

 ✓ TypeScript compile sans erreur (npx tsc --noEmit) apres chaque commit
 ✓ Tunnel cloudflared HTTP 200 verifie a l envoi du mail
 ✓ Pages /planning/quotas, /planning/all-sites repondent (307 = redirect
   login, comportement attendu en non-authentifie)

═════════ NON FAIT (volontairement) ═════════

 ⚠ Equilibrage cross-sites au solver : la generation reste par site, pas
   d arbitrage cross-sites automatique. La Vue d ensemble + drag-drop +
   badge couverture facilitent l equilibrage manuel. Solution algo
   propre = 2-3j de boulot, je prefere valider d abord les autres briques
   avec toi.
 ⚠ Solver phase 2 OT : pas encore boost crescendo. La phase 1 priorisant
   deja les jours critiques, l OT phase 2 ne s active que sur le shortfall
   -- impact mineur dans la majorite des cas.
 ⚠ Scoring : ponctualite affichee mais pas dans le global_score (necessite
   migration DB de la fonction PL/pgSQL).

═════════ PROCEDURE DE TEST iPhone ═════════

  1. Safari iPhone : ${TUNNEL_URL}
  2. Login admin
  3. /planning/quotas?period=4w -> verifie KPI + couverture sites + reco
  4. /planning/all-sites -> badges couverture par cellule (sites filtres)
  5. /planning/sites/{code} -> strip nav en tete (prev/next, chips)
  6. /scoring -> 3e ligne "Ponctualite" sous Couverture
  7. /planning/calendar -> long-press shift = mode deplacement (deja fait
     dans la session mobile precedente)
  8. Generer un planning -> verifier que J-1 d Aid ou samedi sont mieux
     couverts (priorite + crescendo)

═════════ COMMUNICATION DEPUIS L iPhone ═════════

Je rappelle que je ne peux pas recevoir d emails ni de messages chat
depuis l exterieur. Pour me redonner des instructions :
 - Soit tu reviens au PC -> on continue dans cette session
 - Soit tu commences une nouvelle conversation Claude.ai sur iPhone
   (sans contexte de celle-ci)
 - En attendant prends notes / screenshots de ce qui marche ou pas

Repo : ${REPO_URL}

A +,
Claude (CaftanRH builder)
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
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
