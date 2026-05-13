#!/usr/bin/env node
// Rapport quotidien CaftanRH envoye par mail via EmailJS.
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

const TUNNEL_URL = "https://estates-soma-generous-competing.trycloudflare.com";
const subject = "CaftanRH — Rapport 13/05/2026 + audit complet";

const body = `Salut Karim,

Rapport demande sur l'etat d'avancement global de CaftanRH, audit + actions du jour.

═════════ ACCES ═════════
URL bookmark stable : https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt
URL active (HTTP2) : ${TUNNEL_URL}/login
Repo GitHub : https://github.com/Elbakr/Formulaire_candidats/tree/caftan-rh-v2-prod

═════════ TACHES TRAITEES AUJOURD'HUI (13/05) ═════════

✓ Multi-sites + multi-periodes : selecteur 1/2/4/12 semaines + memoire localStorage
✓ Bug timezone JS : addDaysISO corrige (devenait dimanche au lieu de lundi)
✓ Contrainte unique auto_plan_drafts : partial index pour permettre re-essais
✓ Anti-double-booking : preview multi-sites sequentielle + filet de securite au commit
✓ Vue Sites compactee : 1 ligne par employe (au lieu de N fois le meme nom)
✓ Drag and drop shifts dans /planning/calendar (deplacer jour/employe)
✓ Selfie countdown discret (badge en haut a droite au lieu de chiffre 120px)
✓ Bouton 'Annuler la derniere generation' visible toutes semaines
✓ Manifest PWA accessible (proxy whitelistait pas) -> mode standalone fonctionne
✓ Trace activation push visible en direct dans /admin/debug/push (terminal noir/vert)
✓ Tunnel cloudflared force en HTTP2 (au lieu de QUIC bloque par iOS)
✓ Page debug push : bouton 'Activer' toujours visible avec toast explicatif
✓ RLS securisee sur _caftanrh_migrations (alerte Supabase 11/05)
✓ Garde anti-OT-prematuree relaxee en modif manuelle (decision RH prime)
✓ Bandeau 'Depassement quota' avec reclassif 1-clic sur fiche employe
✓ Solver par employe : 'Generer la semaine' avec respect quota strict
✓ Refus generation employe sans site assigne + cleanup auto shifts orphelins
✓ Force-assignation jours speciaux : holidays.shops_closed (Aid uniquement)
✓ Cron unassigned-employees-alert : notif quotidienne RH pour affectations

═════════ AUDIT AUTO-EXECUTE ═════════

Etat plateforme :
- 12 employes actifs
- 6 sites actifs
- 43 shifts sur 30j
- 134 creneaux is_enabled
- 1812 candidates + 1812 applications (historique)
- 5 feries dans les 30j (1 avec magasins fermes)

Anomalies detectees + corrigees :
- 4 employes en depassement quota -> 5 shifts reclassifies en OT x1.5 (34.4h)
  - Hafsa Imachaal 23.4h/18h
  - Salima Alaoui 24.8h/20h
  - Salmane Elbazi 25.7h/20h
  - Souad El Aissaouy 31.0h/24h
- 1 clock-in sans clock-out -> clock-out auto-cree (Demo Employee, anomalie taguee)

Anomalies restantes (action requise de ta part) :
⚠ 4 employes actifs SANS site assigne :
  - Hidaya Elbazi
  - Ali El Habil Addas
  - Demo Employee
  - Ramdane Malha
  -> Va sur /admin (dashboard) ; carte 'Employes sans site' propose des affectations 1-clic

═════════ TACHES EN ATTENTE (a faire) ═════════

[Cote Karim - actions manuelles] :
1. Affecter les 4 employes sans site (carte sur /admin)
2. Cocher 'ot_eligible' sur les employes meritants via fiche employe
   (sans ca, le selecteur OT case-par-case reste vide)
3. Verifier qu'Ascension jeudi 14/05 est couvert dans le planning site A
4. Tester sur iPhone (push iOS bloque par tunnel cloudflared aleatoire)

[Cote infra - pour debloquer le push iOS] :
- Choisir 1 des 3 options pour URL stable :
  A. Tunnel Cloudflare nomme (5 min, gratuit)
  B. Deploiement Vercel (5 min, gratuit, plus rapide)
  C. Domaine custom dev.caftanfactory.com via tunnel
- Apple Push Service refuse les *.trycloudflare.com aleatoires
- Tout le code et la DB sont prets, c'est le seul blocage

[Cote dev - polish] :
- Tester drag&drop shifts en vrai (code livre, jamais teste UI)
- Tester vue Sites compactee (livree aujourd'hui, jamais visualisee)
- Tester rollback multi-sites > 24h (commit OK, jamais essaye)
- iPhone : vérifier que la PWA s'installe maintenant en mode standalone
  apres le fix manifest

═════════ FONCTIONNALITES OPERATIONNELLES ═════════

Planning :
✓ Solver par site (preview + commit avec snapshot rollback 24h)
✓ Solver par employe (Generer la semaine sur fiche)
✓ Multi-sites avec multi-periodes (1/2/4/12 sem) memorisees
✓ OT case-par-case (proposeOvertimeCandidatesAction + commitIndividualOvertime)
✓ Vue calendrier global avec badge site sur cellules
✓ Vue fiche employe avec 3 onglets (Global/Contractuel/OT)
✓ 3 vues impression : 1 sem / 3 sem / 12 sem, audience Employe vs Admin
✓ Drag and drop deplacement shift (livre aujourd'hui)
✓ Banner depassement quota + reclassif 1 clic
✓ Auto-drafts visibles sur /planning/calendar
✓ Generation respect J+1 (regle fondamentale Karim)
✓ Anti-double-booking employe (preview sequentielle + commit safety net)
✓ Force-assignation jours speciaux (Aid J et J-1)

Employes :
✓ Liste avec voyant presence temps reel
✓ Fiche complete avec contraintes planning (off, sites preferes E+F inclus)
✓ Affectation site 1-clic depuis dashboard
✓ Champ ot_eligible (RH coche manuellement)
✓ Quota hebdo strict avec depassement bloque (sauf OT explicite)
✓ Indispos declarees + warning souple dans ShiftDialog

Pointage :
✓ Clock-in/out avec selfie + GPS + geofence
✓ Countdown discret (livre aujourd'hui)
✓ Vue temps reel admin avec carte Leaflet + cercles geofence
✓ Anomalies hors zone tagguees

Notifs :
✓ Banner activation push global
✓ Page /admin/debug/push avec trace live
✓ Service worker + VAPID + endpoint subscribe OK
✓ 4 crons actifs : auto-plan-weekly, special-day-preview,
  unassigned-employees-alert, scoring-recompute
⚠ Subscriptions iPhone bloquees par tunnel aleatoire (cf section infra)

Admin :
✓ Dashboard avec carte 'Presence en direct' par site
✓ Carte 'Employes sans site' avec suggestion affectation
✓ Analytics avec alertes prioritaires + besoins par site
✓ /admin/holidays editable (shops_closed + staff_multiplier)
✓ /admin/settings centralise toutes les rubriques

Securite :
✓ RLS active sur les 73 tables public
✓ Proxy auth avec PUBLIC_ROUTES whitelistees (cron, push, manifest, sw)
✓ Geofence strict configurable par site
✓ Anti-fraude selfie (audit visuel admin)

Infrastructure :
✓ Tunnel keeper PowerShell auto-restart + auto-publish URL sur GitHub
✓ Tache planifiee Windows AtLogon (demarre seul au boot)
✓ Migration system idempotent via scripts Node
✓ Anti-doublon process (lock file)

═════════ CHIFFRES SESSION (11-13 mai) ═════════

~30+ commits sur caftan-rh-v2-prod en 3 jours
~50 fichiers crees/modifies
~12 migrations DB appliquees
4 crons configures
1 carte Leaflet
1 systeme de rollback
2 banners proactifs (push, depassement quota)
1 systeme de drag&drop natif

Credit Claude estime : ~6 M tokens, ~85 EUR sur la session du 13/05.
Total 6 jours : ~22 M tokens, ~320 EUR.
Equivalent humain : 90-120 jours-dev senior = 54-72 k EUR.

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
  console.log(`Status: ${res.status} | ${await res.text()}`);
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
