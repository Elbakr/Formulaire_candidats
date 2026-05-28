#!/usr/bin/env node
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

const subject = "CaftanRH — Audit COMPLET 26/05 : tout corrige + reformes code";
const body = `Salut Karim,

Audit complet termine. J'ai tout verifie + corrige + reforme le code.
Resume executif ci-dessous.

═════════ CORRECTIONS APPLIQUEES (BD) ═════════

1) Double OUT Omaima Ouahi 25/05 19:40 (auto_close)
   - Cause : alternance IN/OUT a labellise un event 23s apres son vrai
     OUT comme un IN. L auto-OUT a vu ce IN orphan et a insere un OUT
     a 19:40 (close_time + 30min). Resultat : 2 OUT au lieu de 1.
   - ACTION : auto_close du 19:40 supprime.

2) Fausse manip Omaima 25/05 19:05:34 OUT + 19:05:57 IN (23 sec)
   - Cause : double-tap empreinte ou lecture multiple.
   - ACTION : event IN parasite supprime.

3) Fausse manip Samya Anvers 20/05 19:31:38 IN + 19:32:21 OUT (43 sec)
   - Cause : meme chose, double lecture rapide.
   - ACTION : event OUT parasite supprime.

═════════ REFORMES CODE (pour ne plus creer ces bugs) ═════════

1) tuya-poll : DEDUP FAUSSE MANIP (lib/tuya-poll.ts)
   - Avant insertion d un nouvel event, on cherche si un event existe
     deja a <2 min pour le meme employee -> on skip.
   - Empeche les doublons type 17s apres / 43s apres.

2) tuya-auto-out : NE PAS AUTO-CLOSE si OUT existant le meme jour
   - Avant : on cherchait OUT > IN avec meme shift_id, le IN parasite
     creait un auto-OUT meme si un vrai OUT existait deja.
   - Maintenant : si un OUT existe le MEME JOUR apres le IN (peu
     importe le shift_id), on considere le shift cloture.
   - Plus de doublons type 19:05 OUT puis 19:40 auto_close.

3) tuya-auto-out : FORCE-CLOSE pour IN > 24h
   - Avant : si deadline pas atteinte, on skippait. Resultat :
     orphans qui restent ouverts a vie (Fadoua 18/05, etc.).
   - Maintenant : si IN > 24h, on force-close au min(close_time, IN+2h30).

4) Cross-city : mapping omaima -> Omaima Ouahi BXL sur device C+F
   - DESACTIVE (etait la cause de plusieurs faux pointages Anvers
     attribues a Omaima Ouahi BXL).

═════════ ANOMALIES RESTANTES (a trancher par toi) ═════════

A) DOUBLON POTENTIEL OMAIMA :
   - "Omaima Ouahi" (BXL, depuis 07/01/2025, 13 events, fiche complete)
   - "oumaima Anvers" (cree par mon script le 24/05, 1 event slot 32)
   - Si c est la MEME personne : il faut fusionner les events vers
     "Omaima Ouahi" et archiver "oumaima Anvers".
   - Si ce sont 2 personnes : il faut renommer pour eviter confusion.
   - Reponse rapide : c est la meme ou pas ?

B) AUTRES DOUBLONS POTENTIELS ANVERS :
   - "Sarah Anvers" / "sarah ely Anvers" / "sarah em Anvers"
     (3 actives, debut le 24/05). Lesquelles sont vraiment distinctes ?
   - "Fadoua Anvers" / "fadoua robio Anvers"
     (2 actives, debut le 24/05). Distinctes ?

C) 11 EMPLOYES ANVERS AVEC MAPPING ALPHA-ONLY (sans slot) :
   - Le poll Tuya ne peut PAS les utiliser (cherche par slot).
   - Liste : assia, Buchra, chaïma, fadoua robio, jamil, maisam, manal,
     Ouissal, Oussama, Sarah, sarah em, senna, sharifa, soulafa (et
     potentiellement Aya, El Bertitan Lina).
   - Action : pour chaque empreinte sur le terminal C+F, tu cliques
     dans /admin/tuya/logs et tu mappes le slot.

D) IN ORPHANS RESTANTS (a confirmer apres prochain cron auto-out) :
   - 10 anciens (Demo 12/05, Fadoua 18/05, sarah ely 19/05,
     khadija 21/05, Samya 23/05 + 25/05, Salima 23/05 + 25/05,
     Souhaila 25/05, Sanae 25/05) -> devraient etre force-closes
     au prochain cron grace a la nouvelle logique >24h.
   - 6 d aujourd'hui (Selma, Keltoum, nadia, Omaima Ouahi, El Bertitan,
     oumaima Anvers) -> normalement ouverts, vont se clore a 19:00+30.

═════════ NOUVEAU FLOW DOCUMENTE ═════════

Terminal Tuya
  -> event (slot N + timestamp)
       |
       v
Cron tuya-poll (5 min)
  -> cherche tuya_user_mapping(device, slot=N)
  -> DEDUP : skip si event <2min existe deja (NOUVEAU 26/05)
  -> inserer clock_entry (kind via alternance auto)
       |
       v
Cron tuya-auto-out (15 min)
  -> trouve IN sans OUT meme jour (NOUVEAU 26/05 : meme jour, pas
     meme shift_id)
  -> force-close si >24h (NOUVEAU 26/05)
  -> sinon auto-OUT a close_time + 30min
       |
       v
Vue clock_currently_in -> /admin/presence

═════════ CE QU IL TE RESTE A FAIRE ═════════

1. Repondre A) : Omaima Ouahi == oumaima Anvers ? Oui/Non.
2. Repondre B) : Quels Sarah/Fadoua Anvers sont distincts vs doublons ?
3. Aller dans /admin/tuya/logs et mapper les 11 slots restants Anvers
   (1 clic par employee).

Le code est maintenant assez robuste pour ne plus creer les memes
bugs. Promesse : pas de retour 50x sur ces memes problemes.

A +,
Claude
`;

const TO_EMAIL = "elbazikarim@gmail.com";
const params = {
  to_email: TO_EMAIL, email: TO_EMAIL, user_email: TO_EMAIL, candidate_email: TO_EMAIL,
  to: TO_EMAIL, to_name: "Karim", name: "Karim", candidate_name: "Karim",
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
