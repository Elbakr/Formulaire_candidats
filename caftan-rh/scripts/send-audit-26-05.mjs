#!/usr/bin/env node
// Karim 2026-05-26 : audit structurel + actions correctives.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) { console.error("Missing EmailJS env vars"); process.exit(1); }

const subject = "CaftanRH — Audit structurel 26/05 : flow Tuya + bugs identifies";
const body = `Salut Karim,

Audit complet du systeme de pointage suite a tes signalements
(Omaima absente malgre 2 reenrolements + plupart Anvers non enroles).

═════════ DIAGNOSTIC ═════════

1) Bug critique trouve : mapping CROSS-CITY
   - Sur le terminal Pointage C et F (Anvers), un mapping nick="omaima"
     pointait vers "Omaima Ouahi" (employee BXL).
   - Resultat : tous les pointages Anvers de cette empreinte allaient
     au mauvais employe.
   - DESACTIVE ce matin.

2) Bug structurel : 18 mappings alpha-only inutiles sur device C+F
   - Tuya n'expose PAS la correspondance slot numerique <-> user_id alpha.
   - Mon script auto-enrolement Anvers a cree des mappings name-based
     (alpha sans slot) qui sont INUTILISABLES par le poll
     (le poll cherche par slot numerique uniquement).
   - => Sur 31 mappings actifs C+F, seulement 13 fonctionnent reellement.
   - Pour les 18 autres : il faut faire le rapprochement manuel via
     /admin/tuya/logs (1 clic par employee, persiste ensuite).

3) Omaima reenrolement matin 26/05
   - Slot 32 a genere un event a 10:01 ce matin sur device C+F.
   - Ce slot n'avait aucun mapping en BD.
   - ASSIGNE slot 32 -> "oumaima Anvers" (employee creee hier).
   - Slot 18 reste non mappe (event hier 22:03 - probablement
     2eme empreinte d'une employee soir, a identifier).

4) 7 IN orphans bloques en "present" depuis 1-14 jours
   - Demo Employee 12/05 (14 jours)
   - Fadoua Anvers 18/05 (8 jours)
   - sarah ely Anvers 19/05 (7 jours)
   - khadija Anvers 21/05 (5 jours)
   - Samya Anvers 23/05 (3 jours)
   - Souhaila Anvers + Sanae Asaidi 25/05 (1 jour)
   - Cause : le cron auto-OUT ne traitait que les IN <7 jours.
   - CORRIGE : fenetre etendue a 30 jours + force-close inconditionnel
     pour IN >24h (cas extreme).

═════════ FLOW DU POINTAGE TUYA (documentation) ═════════

1. Employee pose son doigt sur terminal -> Tuya genere un event
   unlock_fingerprint_kit avec :
   - tuya_device_id
   - event_time (timestamp ms)
   - value (base64 contenant slot numerique 0-N)

2. Cron /api/cron/tuya-poll (toutes 5 min) :
   - Fetch events depuis last_sync via API Tuya
   - Pour chaque event : decode slot, cherche tuya_user_mapping
     (device_id, tuya_user_id=slot)
   - Si trouve -> insere clock_entries (kind=in/out par ALTERNANCE
     chrono du jour)
   - Si NON trouve -> skipped_no_mapping (Karim mappe via UI)

3. Cron /api/cron/tuya-auto-out (toutes 15 min) :
   - Trouve les IN sans OUT correspondant
   - Auto-OUT a close_time du site + 30 min de tolerance
   - Fallback : shift.end_time + 1h, ou IN + 9h garde-fou
   - NOUVEAU (26/05) : force-close pour IN >24h

4. Vue clock_currently_in (SQL view) :
   - Retourne les IN sans OUT correspondant ce jour
   - Utilisee par /admin/presence pour afficher les presents

═════════ POURQUOI CA PLANTE REGULIEREMENT ═════════

PROBLEME FONDAMENTAL : Tuya Cloud n'expose PAS la correspondance entre
le slot numerique (dans les events) et le user_id alpha
(dans /devices/{id}/users qui retourne aussi le nick_name).

Consequences :
- Impossible d'auto-mapper a partir du nom Tuya
- Karim DOIT faire le mapping manuel via /admin/tuya/logs (1 clic)
- Quand un employee reenrole son empreinte : Tuya lui attribue souvent
  un NOUVEAU slot -> ancien mort, nouveau non mappe -> "absente"

═════════ ACTIONS DEJA EFFECTUEES AUJOURD HUI ═════════

- Mapping cross-city Omaima Ouahi BXL <- device C+F : DESACTIVE
- Slot 32 (Omaima reenrolement matin) : MAPPE oumaima Anvers
- Cron tuya-auto-out : fenetre 7j -> 30j + force-close >24h
- tuya-poll : log explicite des slots non mappes (best-effort)
- /planning/employees/[id]/prestations : edition complete des pointages
  (modif kind/heure, suppression, ajout manuel) pour TOUS les employes
- /admin/heures-prestees : profil historique 60j par employe
  + detection auto evening worker via vrais shifts soir complets
- Page /planning/employees :
  - 24 Anvers maintenant assignes au site C (etaient sans site_assignment)
  - Filtre ville fonctionnel (BXL=13, Anvers=24, Tous=37)
  - Archives caches (ne s affichent plus en bas)
- Toggle ville : ajout option "Tous"

═════════ A FAIRE MAINTENANT (toi) ═════════

1. Verifier /admin/tuya/logs : pour chaque slot non mappe restant
   (slot 18 + les 18 alphas-only), cliquer "Mapper" et associer
   au bon employee.
2. Verifier le tableau de bord /admin/heures-prestees :
   les heures doivent maintenant etre coherentes apres force-close
   des orphans.
3. Si un autre employee est marquee absente alors que tu sais
   qu elle a pointe : c est probablement un slot non mappe ->
   /admin/tuya/logs pour mapper.

═════════ REFORME PROPOSEE POUR EVITER LE PROBLEME ═════════

Court terme :
- UI /admin/tuya/logs : auto-suggest mapping base sur le nick_name Tuya
  + bouton "Mapper en 1 clic" pour les slots vus dans les events
- Alerte HR temps reel quand un nouveau slot apparait sans mapping

Moyen terme :
- Heuristique de matching : si nick_name Tuya contient un nom
  d employe non encore mappe avec slot, proposer le matching auto
  (avec confirmation Karim)
- Detection des reenrolements : si un employe a un slot inactif depuis
  N jours ET un nouveau slot apparait avec un nick similaire ->
  proposer transfert auto

═════════ POSITION ACTUELLE ═════════

- Mappings fonctionnels Anvers : 13 / 24 employes (54%)
- Mappings a faire manuellement : 11 employes restants
- IN orphans : 7 a clore (force-close au prochain cron auto-out)
- Slot 18 : a identifier par Karim sur le terminal

A +,
Claude
`;

async function send() {
  const params = {
    to_email: "elbazikarim@gmail.com", email: "elbazikarim@gmail.com",
    user_email: "elbazikarim@gmail.com", candidate_email: "elbazikarim@gmail.com",
    to: "elbazikarim@gmail.com", to_name: "Karim", name: "Karim", candidate_name: "Karim",
    from_name: "CaftanRH", reply_to: "hr@caftanfactory.com",
    subject, message: body, html_message: body.replace(/\n/g, "<br>"),
    body, html: body.replace(/\n/g, "<br>"), content: body,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE_ID, template_id: TEMPLATE_ID, user_id: PUBLIC_KEY, template_params: params }),
  });
  console.log(`Status: ${res.status} | ${await res.text()}`);
}
send().catch((e) => { console.error("Erreur:", e.message); process.exit(1); });
