#!/usr/bin/env node
// Envoi mail recap URLs CaftanRH via EmailJS REST.
// Memes credentials que send-daily-report.mjs / send-test-mail.mjs.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error("Missing EmailJS env vars in .env.local");
  process.exit(1);
}

const TO_EMAIL = "elbazikarim@gmail.com";
const TO_NAME = "Karim";
const FROM_NAME = "CaftanRH";
const REPLY_TO = "hr@caftanfactory.com";

const STABLE_URL = "https://caftanrh.loca.lt";
const CLOUDFLARED_URL = "https://estates-soma-generous-competing.trycloudflare.com";
const BOOKMARK_URL = "https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt";
const LAN_URL = "http://192.168.129.81:3000";
const LOCAL_URL = "http://localhost:3000";
const REPO_URL = "https://github.com/Elbakr/Formulaire_candidats/tree/caftan-rh-v2-prod";

const subject = "CaftanRH — Nouvelles URLs (localtunnel stable + diag push)";

const body = `Salut Karim,

Recap des URLs apres les 2 commits de ce matin
(bouton Diagnostic Push + keeper localtunnel subdomain stable).

═════════ URL STABLE NOUVEAU (RECOMMANDEE) ═════════

  ${STABLE_URL}
  Page diag push : ${STABLE_URL}/admin/debug/push

  Subdomain fixe -- l URL ne change PLUS d un restart a l autre.
  La PWA installee sur iPhone reste valide, l abonnement push survit.

  Comment l activer :
    1. Stoppe le tunnel cloudflared (Task Manager -> cloudflared.exe -> End)
    2. Lance : powershell -File caftan-rh/scripts/localtunnel-keeper.ps1
    3. Premiere visite Safari iPhone -> page "Click to continue" -> tape OK
    4. Ajoute a l ecran d accueil -> ouvre la PWA -> menu admin
       -> Diagnostic Push -> Activer

═════════ URL CLOUDFLARED (LEGACY) ═════════

  ${CLOUDFLARED_URL}
  Page diag push : ${CLOUDFLARED_URL}/admin/debug/push

  Marche encore tant que tu ne stoppes pas le keeper actuel, mais
  l URL changera au prochain restart -- ce qui casse la PWA iPhone.

═════════ AUTRES URLs ═════════

  URL bookmark stable (suit l URL active dans le repo) :
    ${BOOKMARK_URL}

  Local dev (PC) : ${LOCAL_URL}
  Local dev diag : ${LOCAL_URL}/admin/debug/push

  LAN meme Wi-Fi : ${LAN_URL}

  Repo GitHub : ${REPO_URL}

═════════ NOUVEAUTES DEPUIS HIER SOIR (2 commits) ═════════

✓ feat(push) : bouton "Diagnostic Push" (icone stethoscope) dans la
   nav admin -- 1 tap depuis la PWA pour relancer le test
✓ feat(push) : trace activation desormais persistee en localStorage
   sous "caftanrh-push-trace-v1" -- si tu accordes la permission iOS
   puis quittes la page, tu peux y revenir et voir ou ca en etait
✓ Petit bouton "vider" pour reset manuel de la trace
✓ Cache SW bumpe en v5-push-diag (force refresh iPhone)

✓ feat(tunnel) : scripts/localtunnel-keeper.ps1 -- keeper jumeau de
   l existant tunnel-keeper.ps1 mais avec --subdomain caftanrh fixe
✓ Anti-doublon via lock file ($env:USERPROFILE\\localtunnel-keeper.lock)
✓ Log : $env:USERPROFILE\\localtunnel-keeper.log
✓ Auto-commit du TUNNEL_URL.txt avec la nouvelle URL stable
✓ Officialisation de localtunnel ^2.0.2 en devDep (deja installe local)

═════════ COMMENT TESTER ═════════

  PC : juste ouvrir ${LOCAL_URL}/admin/debug/push
       (verifier que "Diagnostic Push" apparait dans le menu de gauche)

  iPhone (push iOS) :
       1. Stopper cloudflared (sinon conflit port 3000 -- non en fait
          cloudflared peut tourner en parallele de localtunnel, mais
          un seul des deux doit etre source de verite)
       2. powershell -File caftan-rh/scripts/localtunnel-keeper.ps1
       3. Sur Safari iPhone : ${STABLE_URL} -> page "Click to continue"
       4. Partager -> Sur l ecran d accueil
       5. Ouvrir la PWA depuis l icone -> login -> menu admin
       6. Diagnostic Push -> Activer maintenant
       7. Accorder la permission iOS quand elle apparait
       8. Si tu navigues ailleurs, reviens via Diagnostic Push :
          la trace est toujours la

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
  if (!res.ok) {
    console.log("\n--- BACKUP : contenu a copier-coller dans Gmail ---");
    console.log("TO:", TO_EMAIL);
    console.log("SUBJECT:", subject);
    console.log("BODY:");
    console.log(body);
  }
}

send().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
