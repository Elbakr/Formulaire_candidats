// Envoie a Karim un mail avec les URL d acces a distance et les bookmarks
// directs vers la nouvelle interface mobile "Quick availability". Karim 20/05.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

let tunnelUrl = "https://blocks-representatives-clarity-patterns.trycloudflare.com";
try {
  const txt = readFileSync(resolve(__dirname, "../TUNNEL_URL.txt"), "utf-8");
  const m = txt.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m) tunnelUrl = m[0];
} catch {}

const QUICK_URL = `${tunnelUrl}/quick/availability`;
const LAN_URL = "http://192.168.129.81:3000/quick/availability";
const STABLE = "https://caftanrh.loca.lt/quick/availability";
const BOOKMARK_AUTO = "https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt";

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("Missing EmailJS env vars");
  process.exit(1);
}

const subject = "CaftanRH — Interface mobile Dispos/Absences (face-a-face)";
const body = `Salut Karim,

Nouvelle interface mobile prete pour les entretiens face-a-face.

═════════ ACCES RAPIDE ═════════

LIEN PRINCIPAL (cloudflared, change a chaque restart) :
${QUICK_URL}

LIEN STABLE (si localtunnel keeper actif) :
${STABLE}

LAN meme Wi-Fi (le plus rapide au bureau) :
${LAN_URL}

URL toujours a jour (bookmark Safari) :
${BOOKMARK_AUTO}

═════════ CONNEXION ═════════

Ton compte admin habituel (elbazikarim@gmail.com + le mot de passe que tu
connais deja). Si Safari te re-demande, deroule "Mots de passe" -- il est
sauve dans le trousseau iCloud.

═════════ COMMENT CA MARCHE ═════════

1. Ouvre le lien sur ton iPhone
2. Connecte-toi (compte admin)
3. Tu vois la liste des employes actifs avec barre de recherche en haut
4. Tap sur le nom de l employe en face de toi

Sur la fiche employe (1 ecran) :

  [Bouton orange] "Mettre <prenom> en conge"
     -> Type (Maladie/Conge/Perso/Sans solde/Autre)
     -> Date debut (defaut aujourd hui)
     -> Date fin (LAISSE VIDE si pas connue, c est OK)
     -> Case "supprimer les shifts" (cochee par defaut)
     -> Valider

  Grille [Indispos recurrentes] :
     Lignes : am / pm / full
     Colonnes : Lun-Dim
     Tap une case = bascule dispo (vide) <-> indispo (rouge X)
     Effet immediat, pas de save bouton

  Liste [Indispos ponctuelles] :
     "+ Ajouter une indispo ponctuelle"
     -> Date + creneau (Matin/AM/Journee) + motif
     Liste les indispos a venir, poubelle pour supprimer

Tout est instantane. Pas de page de save. Tu peux passer d un employe a
l autre via le bouton "<" en haut a gauche.

═════════ AUTRES ECRANS UTILES SUR MOBILE ═════════

Planning calendrier (employes) :
${tunnelUrl}/planning/employees

Cockpit RH :
${tunnelUrl}/admin/cockpit

Dates des Aid (a confirmer) :
${tunnelUrl}/admin/settings/aid-dates

Demande de renfort :
${tunnelUrl}/planning/reinforcement

═════════ ASTUCE IPHONE ═════════

Pour installer en PWA et avoir un acces 1-tap depuis l ecran d accueil :
  Safari -> Partager -> Sur l ecran d accueil -> renomme "CaftanRH"

═════════ SI L URL CLOUDFLARED CHANGE ═════════

Re-lance le tunnel :
  cd caftan-rh && cloudflared tunnel --url http://localhost:3000

OU utilise le bookmark TUNNEL_URL.txt qui est mis a jour automatiquement par
le keeper.

A +,
Claude
`;

const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({
    service_id: SERVICE_ID,
    template_id: TEMPLATE_ID,
    user_id: PUBLIC_KEY,
    template_params: {
      to_email: "elbazikarim@gmail.com",
      email: "elbazikarim@gmail.com",
      recipient: "elbazikarim@gmail.com",
      user_email: "elbazikarim@gmail.com",
      candidate_email: "elbazikarim@gmail.com",
      to: "elbazikarim@gmail.com",
      to_name: "Karim",
      name: "Karim",
      from_name: process.env.NEXT_PUBLIC_EMAILJS_FROM_NAME || "CaftanRH",
      reply_to: process.env.NEXT_PUBLIC_EMAILJS_REPLY_TO || "hr@caftanfactory.com",
      subject,
      message: body,
      html_message: body.replace(/\n/g, "<br>"),
      body,
      html: body.replace(/\n/g, "<br>"),
      content: body,
    },
  }),
});
const text = await res.text();
console.log(`Mail status: ${res.status} | ${text}`);
console.log(`\n--- BACKUP CONTENT ---`);
console.log("TO: elbazikarim@gmail.com");
console.log("SUBJECT:", subject);
console.log("URLS:");
console.log("  Quick:", QUICK_URL);
console.log("  LAN:", LAN_URL);
console.log("  Bookmark auto:", BOOKMARK_AUTO);
process.exit(res.ok ? 0 : 1);
