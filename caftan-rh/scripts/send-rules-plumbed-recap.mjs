#!/usr/bin/env node
// Envoi mail recap "Regles autoplaner centralisees + plumbing" via EmailJS REST.
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
const RULES_PAGE = `${TUNNEL_URL}/admin/settings/autoplaner-rules`;

const subject = "CaftanRH — Regles autoplaner centralisees + URL test iPhone";

const body = `Salut Karim,

Mission poursuivie. Les regles de l autoplaner sont desormais centralisees
dans /admin/settings, toggables une par une, et 14 sur 28 sont effectivement
branchees au solver (les autres sont documentees en attente de plumbing).

═════════ URL DE TEST iPhone ═════════

  ${TUNNEL_URL}

  Safari iPhone, login admin, puis vise directement :
  ${RULES_PAGE}

  Tunnel cloudflared verifie HTTP 200 a l envoi du mail.

═════════ NOUVEAUTES DE LA SESSION ═════════

[1] Page settings dediee : /admin/settings/autoplaner-rules
    - 28 regles listees, groupees par categorie :
      * Generation (smart prefill, min separation, fractionnement OT...)
      * Multipliers (feries x effectif, saisonnier, crescendo J-7, ponts)
      * Priority (managers, responsables magasin, seniors)
      * Multi-site, Overtime, Validation, Constraints
    - Chaque regle a un switch ON/OFF persiste en base (org_settings.autoplaner_rules jsonb)
    - Badge "plumbed" (la regle agit reellement sur le code) ou "documentation"
      (presente mais pas encore branchee, sera ignoree par le solver)
    - Bouton "Reinitialiser" remet tous les defauts

[2] 14 regles plumbed end-to-end (verification npx tsc --noEmit clean) :

    Crescendo + Ponts (commit precedent) :
     - crescendo_before_holidays    J-7 a J-1 facteur 1.0->3.0 1ere fete, ->1.5 2eme
     - pont_friday_after_thursday   jeudi ferie -> vendredi en pont (75%)
     - pont_monday_before_tuesday   mardi ferie -> lundi en pont
     - pont_weekend_extended_monday  lundi ferie -> samedi+dimanche+lundi rush

    Managers + Responsables magasin (commit precedent) :
     - manager_priority             tri eligibles phase 1 par roleRank
     - site_manager_priority        idem en phase 2 OT (candidates)
     - manager_ot_boost_2x          cap OT force >= weekly_hours x 2.0
     - site_manager_ot_boost_2_5x   cap OT force >= weekly_hours x 2.5

    Multiplicateurs + tri (commit 70bf888, aujourd hui) :
     - anti_overlap_same_employee   bloque chevauchement upsert (OFF = legacy)
     - holiday_staff_multiplier     gonfle headcount sur jours feries
     - seasonal_peak_multiplier     Ramadan/soldes/fin annee
     - senior_first_on_demanding_slots  tri seniorite sur creneaux exigeants

[3] 14 regles "documentation" (toggables mais pas encore plumbed) :
    smart_prefill, min_separation, auto_split, reclassify_existing_ot,
    ot_proposals_on_second_gen, ot_personal_cap, cross_site_criticality_sort,
    no_double_booking, exhaust_quota_before_ot, no_overlap_in_generation,
    respect_partial_unavail, critical_needs_weight, mandatory_validation_rush_weeks,
    score_penalty
    -> badge "documentation" sur la page. Toggle a un effet UI mais le solver
       n applique pas encore la regle.

═════════ COMPORTEMENT DES TOGGLES ═════════

  - Plumbed ON  : la regle s applique au prochain run du solver (ou au
                  prochain upsert pour anti_overlap).
  - Plumbed OFF : retour comportement neutre : multiplicateur=1.0, tri
                  desactive, check overlap bypasse, etc.
  - Documentation ON/OFF : aucun effet code, juste un toast d info.

═════════ PROCEDURE DE TEST iPhone ═════════

  1. Safari iPhone : ${TUNNEL_URL}
  2. Login admin
  3. ${RULES_PAGE}
     - Verifie que tu vois 28 regles groupees par categorie
     - Toggle "holiday_staff_multiplier" OFF puis regenere un planning
       sur une semaine contenant un ferie : effectif requis NE doit PAS
       etre gonfle. Re-active la regle et re-genere : effectif x staff_mult.
     - Toggle "manager_priority" OFF : un employe non-manager peut etre
       choisi avant un manager si son fit_score est superieur.
  4. /planning/employees/bulk-edit
     - Active le flag "Manager" sur quelqu un -> son ot_max_multiplier
       est force a >= 2.0 (cap automatique)
  5. /planning/calendar
     - Tente de creer 2 shifts qui se chevauchent : refus si la regle est ON.
     - Toggle OFF dans /admin/settings/autoplaner-rules puis re-essaye :
       l overlap passe (comportement legacy).

═════════ COMMITS PUSHES SUR caftan-rh-v2-prod ═════════

  - feat(rules): plumb 9 regles autoplaner supplementaires (total 14/28 wired)
    -> commit 70bf888 (aujourd hui)

  Build local : npx tsc --noEmit OK.

═════════ COMMUNICATION DEPUIS L iPhone ═════════

Je rappelle que je ne peux pas recevoir d emails ni de messages chat
depuis l exterieur. Pour me redonner des instructions :
 - Soit tu reviens au PC -> on continue dans cette session
 - Soit tu commences une nouvelle conversation Claude.ai sur iPhone
   (sans contexte de celle-ci, donc resume rapidement)
 - En attendant : notes / screenshots de ce qui marche ou pas

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
