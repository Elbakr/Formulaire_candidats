#!/usr/bin/env node
// Envoi mail "Version mobile prête à tester" via EmailJS REST.
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
const BOOKMARK_URL = "https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt";

const subject = "CaftanRH — Version mobile prete a tester sur iPhone";

const body = `Salut Karim,

La version mobile-friendly est en ligne sur la branche caftan-rh-v2-prod.
J ai adapte les 4 ecrans les plus denses pour iPhone.

═════════ URL DE TEST iPhone Safari ═════════

  ${TUNNEL_URL}

  Tape cette URL dans Safari iPhone, ou ouvre le bookmark stable :
  ${BOOKMARK_URL}
  (le fichier TUNNEL_URL.txt suit l URL active dans le repo)

  Conseil : ajoute le site a l ecran d accueil (bouton Partager > Sur
  l ecran d accueil) pour avoir l app en mode PWA standalone (necessaire
  pour les push iOS).

═════════ CE QUI A CHANGE -- 4 phases ═════════

PHASE 1 -- Vue d ensemble magasins (/planning/all-sites)
  > Avant : drag and drop souris uniquement, marche pas sur iPhone
  > Maintenant :
    - Tap sur un shift -> ring gold + bottom bar "Shift selectionne"
    - Tap sur une cellule cible -> deplacement immediat
    - Tap a nouveau le meme shift -> annule la selection
    - Bouton Annuler dans la bottom bar
    - Sites filtres : seulement ceux avec planning genere
  > Cellule vide en mode selection affiche "Tape ici pour deplacer"

PHASE 2 -- Planning hebdo (/planning/calendar)
  > Plus complexe : un shift a deja un tap = ouvrir dialog d edition
  > Solution iOS-native :
    - Tap court (<500ms) sur shift -> ouvre dialog (comportement actuel)
    - Long-press (>=500ms) sur shift -> vibration + mode selection
    - Cellules (employe x jour) deviennent tap-targets
    - Bottom bar avec employe + horaire + date d origine
  > Sur desktop : drag and drop souris continue de marcher

PHASE 3 -- Presence live (/admin/presence)
  > Bouton "Sortir" devient icone-only sur iPhone
  > Evite que la ligne wrap (gain ~50px par ligne)

PHASE 4 -- Liste employes (/planning/employees)
  > Verifie : flex-wrap deja en place, layout fonctionnel sur iPhone
  > Fiche employe : grid-cols-1 md:grid-cols-3 deja responsive
  > Aucun changement necessaire pour cette phase

═════════ COMMENT TESTER iPhone (procedure) ═════════

1. Tunnel cloudflared actif (verifie avant d ouvrir Safari)
2. Safari iPhone -> ${TUNNEL_URL}
3. Login (admin)
4. Test PHASE 1 :
   Menu -> Planning -> Vue d ensemble magasins
   Genere une semaine avec >=2 sites (sinon rien a deplacer)
   Tape un shift -> bottom bar apparait
   Tape une autre cellule -> shift deplace + toast confirmation
5. Test PHASE 2 :
   Menu -> Planning -> Planning hebdo
   Tap court sur un shift -> dialog edition (close avec Annuler)
   Long-press 1s sur un shift -> vibration + ring gold + bottom bar
   Tap une cellule (autre employe, autre jour) -> deplacement
6. Test PHASE 3 :
   Menu admin -> Presence live
   Verifie que les boutons sont compacts (icone seule pour Sortir)
7. Test PHASE 4 :
   Menu -> Planning -> Employes
   Verifie le scrolling vertical fluide

═════════ POINTS D ATTENTION ═════════

  ⚠ Tunnel cloudflared = URL aleatoire (${TUNNEL_URL.split("/")[2]}).
    Si le tunnel restart, l URL change -> casse la PWA installee.
    Solution durable : cloudflared nomme ou deploy Vercel.

  ⚠ Push iOS : Apple peut refuser cette URL aleatoire au moment du
    pushManager.subscribe (step 3b dans la trace). Si oui, c est attendu
    avec un tunnel random -- besoin d une URL stable pour aboutir.

  ⚠ Long-press calendar : si tu observes des "faux positifs" (selection
    qui s arme alors que tu voulais juste tapoter), je peux passer le
    seuil de 500ms a 700ms.

═════════ COMMENT COMMUNIQUER DEPUIS L iPhone ═════════

Je ne peux pas recevoir d emails ni de messages chat depuis l exterieur.
Pour me redonner des instructions :
  - Soit tu reviens au PC -> on continue la conversation
  - Soit tu commences une NOUVELLE conversation sur Claude.ai mobile
    (mais sans le contexte de celle-ci)
  - En attendant, prends des notes/screenshots de ce qui marche ou pas

═════════ DETAIL TECHNIQUE ═════════

3 commits sur caftan-rh-v2-prod aujourd hui (14/05) :
  - a9fc5b2 : bouton Diagnostic Push + trace persistante localStorage
  - 243d6e9 : keeper localtunnel subdomain stable
  - c75e76b : filter sites + drag-drop entre cellules all-sites
  - 17d66bc : publish cloudflared URL ${TUNNEL_URL.split("/")[2]}
  - 17d3729 : tap-to-move 4 ecrans mobile (cette release)

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
