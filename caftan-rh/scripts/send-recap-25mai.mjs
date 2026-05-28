// Karim 2026-05-25 : mail final apres fixes du matin.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const T = "https://generally-twelve-minimum-administrators.trycloudflare.com";

const body = `Salut Karim,

Nouvelle URL tunnel (cloudflared, fonctionne a distance) :
  ${T}

----- Fixes ce matin -----

1. **Bug Omaima 20/05 (manquait dans Prestations)** : RESOLU
   - Cause : phantom auto_close du 20/05 a 03:00 du matin (bug ancien algo).
   - Action : 3 phantoms supprimes (Omaima 20/05, Sanae 20/05, Hafsa 21/05).
   - Re-sync : 2 events Omaima 20/05 inseres (IN 08:01 + OUT 18:04 = ~10h).

2. **Bug auto-OUT samedi 23/05 a 21:00 au lieu de 20:00** : RESOLU
   - Cause : ancien algo "shift.end_time + 1h" sur des IN inconditionnels >24h.
   - 3 OUT corriges (Salima, Ibtissem, Omaima) : occurred_at = 20:00 local (close_time Site A samedi).

3. **Bug page Prestations : "07:57-17:32" affiche comme planifie pour les pointages hors-shift** : RESOLU
   - Maintenant affiche "Hors planning" en italique amber pour les rows orphelines.
   - L'utilisateur comprend immediatement que ce n'est pas un shift planifie.

4. **Cleanup auto_close premature** : 1 auto_close supprime (qui bloquait un OUT reel tuya posterieur) + 1 event IN reclassifie en OUT.

5. **Extraction complete 8 derniers jours Tuya** : VERIFIE
   - 179 events Tuya fetched
   - 77 deja en BD (correctement)
   - 102 events sur des SLOTS NON MAPPES (Pointage A 7 events, Pointage E 2, Pointage C et F 93)
   - Ces 102 events n ont aucun mapping employee -> a mapper via /admin/tuya/logs (1 clic par slot)

----- Slots non mappes a enroler -----

Pointage A (7 events de 7 slots) :
   slot 14, 64, 65, 87, 96, 97, 100 (1 event chacun, mais certains correspondent peut-etre a des employees reels)

Pointage E (2 events) :
   slot 65, 66 (1 event chacun)

Pointage C et F (93 events de 18 slots) :
   slot 25 (14 ev), slot 3 (10), slot 1 (9), slot 32 (7), slot 33 (7), slot 14 (6), slot 9 (6), slot 61 (6), slot 60 (5)... (rest)

NB : Pointage C et F = Anvers, deploiement futur. Pas urgent de mapper.

----- Tests verifies -----

* Omaima 20/05 = IN 08:01 + OUT 18:04 (10h travaillees) - en BD
* Auto-OUT 23/05 = 20:00 (= close_time site A samedi)
* Page Prestations : rows hors planning ont badge italique amber au lieu des heures fictives
* Tunnel : HTTP 200 OK

----- Deep links a tester -----

* Prestations Omaima : ${T}/planning/employees/05745bf6-5281-4429-a146-9f0902021ee8/prestations?view=week
* Prestations Hafsa  : ${T}/planning/employees/b69ba2a4-cbf3-4f0c-bef3-aae5fdcc6706/prestations?view=week
* Prestations Salima : ${T}/planning/employees/c688b891-7d44-4a23-b666-f6da7d644056/prestations?view=week
* Logs Tuya          : ${T}/admin/tuya/logs (cherche les "Non mappe" en haut, click pour enroler)
* Presence live      : ${T}/admin/presence
* Import CSV (mai 1-17) : ${T}/admin/tuya/import

----- Limitations connues -----

* API Tuya retient ~7-8 jours d historique. Avant le 17 mai : utilise /admin/tuya/import pour saisir manuellement (CSV format documente sur la page).
* Le slot local Tuya n est pas derivable du user_id alphanumerique - mapping doit etre fait manuellement au 1er enrôlement.

Bonne journee,
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
    subject: "CaftanRH — Fixes 25/05 : Omaima 20/05 + auto-OUT 23/05 + nouveau tunnel",
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
