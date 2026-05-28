// Envoie a Karim un mail COMPLET de test a distance avec toutes les URL
// pre-testees fonctionnelles (HTTP 200). Karim 2026-05-21.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const txt = readFileSync(resolve(__dirname, "../TUNNEL_URL.txt"), "utf-8");
const m = txt.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
if (!m) {
  console.error("TUNNEL_URL.txt vide ou malforme");
  process.exit(1);
}
const BASE = m[0];

// Verifie chaque URL avant d envoyer (le mail ne part qu apres validation)
const routes = [
  { label: "Login", path: "/login" },
  { label: "Mobile dispo/conge (face-a-face)", path: "/quick/availability" },
  { label: "Liste employes", path: "/planning/employees" },
  { label: "Cockpit RH", path: "/admin/cockpit" },
  { label: "Parametres globaux", path: "/admin/settings" },
  { label: "Dates Aid (a confirmer)", path: "/admin/settings/aid-dates" },
  { label: "Planning calendrier", path: "/planning/calendar" },
  { label: "Magasins (sites)", path: "/planning/sites" },
  { label: "Demande de renfort", path: "/planning/reinforcement" },
  { label: "Notifications push debug", path: "/admin/debug/push" },
];

console.log(`Verification de ${routes.length} routes via ${BASE}...`);
const results = [];
for (const r of routes) {
  const url = BASE + r.path;
  const res = await fetch(url, { method: "GET", redirect: "follow" }).catch(() => null);
  const code = res?.status ?? 0;
  const ok = code >= 200 && code < 400;
  results.push({ ...r, url, code, ok });
  console.log(`  HTTP ${code} ${r.path}`);
}
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n❌ ${failed.length} route(s) en echec. ABORT envoi mail :`);
  for (const f of failed) console.error(`  ${f.code} ${f.path}`);
  process.exit(1);
}
console.log(`\n✓ Toutes les routes repondent. Envoi mail...`);

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("Missing EmailJS env vars");
  process.exit(1);
}

const LAN = "http://192.168.129.81:3000";
const BOOKMARK_AUTO = "https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt";

const subject = "CaftanRH — Acces distance TESTE OK (toutes routes 200)";

const routeLines = results
  .map((r) => `  [${r.code}] ${r.label}\n      ${r.url}`)
  .join("\n\n");

const body = `Salut Karim,

Le tunnel etait tombe pendant la nuit. Je l ai relance et j ai teste toutes
les routes principales en HTTP avant d envoyer ce mail.

═════════ STATUS ═════════

  Tunnel : ACTIF (${BASE})
  Next.js : RUNNING sur localhost:3000
  Routes testees : ${results.length}/${results.length} en HTTP 200
  Date du test : ${new Date().toLocaleString("fr-BE", { timeZone: "Europe/Brussels" })}

═════════ URL PRINCIPALE (TESTEE) ═════════

  ${BASE}/login

Connecte-toi avec ton compte admin (mot de passe sauve dans le trousseau
iCloud sur ton iPhone).

═════════ URL TOUJOURS A JOUR (pour bookmark Safari) ═════════

Ce lien renvoie toujours l URL en cours -- meme apres un restart du tunnel.
Bookmark-le, ouvre-le quand tu doutes :
  ${BOOKMARK_AUTO}

═════════ ROUTES TESTEES (tap pour ouvrir) ═════════

${routeLines}

═════════ LAN (au bureau, Wi-Fi commun) ═════════

Quand tu es sur le meme Wi-Fi que le PC :
  ${LAN}/login
  ${LAN}/quick/availability
  ${LAN}/planning/employees

Plus rapide qu en passant par cloudflared. Mais ne marche pas hors bureau.

═════════ FOCUS : INTERFACE MOBILE DISPO/CONGE ═════════

C est l ecran principal pour les entretiens face-a-face :

  ${BASE}/quick/availability

1. Recherche un employe (taper son nom)
2. Tap sur sa carte
3. Sur la fiche :
   - Bouton orange "Mettre <prenom> en conge" (type/dates, fin facultative)
   - Grille 3x7 indispos recurrentes (tap = bascule)
   - Liste indispos ponctuelles (+ ajouter / poubelle pour supprimer)

Tout est instantane, pas de bouton save. Effet immediat en base.

═════════ ASTUCE PWA IPHONE ═════════

1. Ouvre ${BASE} dans Safari
2. Partager (icone carre avec fleche)
3. "Sur l ecran d accueil"
4. Renomme "CaftanRH"
5. Tu auras une icone 1-tap, sans barre d adresse Safari

═════════ SI TUNNEL TOMBE A NOUVEAU ═════════

Bookmark auto :
  ${BOOKMARK_AUTO}
  -> ouvre-le, copie l URL affichee, colle-la dans Safari

OU relance manuellement sur le PC :
  cd caftan-rh
  C:\\Users\\KElba\\cloudflared.exe tunnel --url http://localhost:3000

═════════ RECAP DES NOUVEAUTES DEPUIS HIER ═════════

  • Page mobile /quick/availability (face-a-face entretiens)
  • Bouton "Mettre en conge" sur fiche employe + calendrier
     (dates debut + fin OPTIONNELLE)
  • Page /admin/settings/aid-dates pour confirmer/decaler Aid Saghir/Kabir
     (cron quotidien 8h11 -> mail si Aid approche non confirmee)
  • 21 site_assignments crees pour reconcilier les renforts cross-site
  • Bannieres d incoherence sur pages site + calendrier employe
  • Cron coherence shifts 8h07 -> mail si nouveau mismatch detecte
  • Migration RLS : managers/RH peuvent creer conges pour autres employes

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
const respText = await res.text();
console.log(`\nMail status: ${res.status} | ${respText}`);
console.log(`\nURL principale (testee OK): ${BASE}`);
console.log(`Route mobile (testee OK):   ${BASE}/quick/availability`);
process.exit(res.ok ? 0 : 1);
