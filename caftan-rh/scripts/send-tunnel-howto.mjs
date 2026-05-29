#!/usr/bin/env node
// Karim 2026-05-29 : mail avec instructions pour lancer tunnel cloudflare.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
if (!SERVICE || !TEMPLATE || !KEY) { console.error("Missing EmailJS env"); process.exit(1); }

const subject = "CaftanRH — Tunnel Cloudflare pour test à distance";
const body = `Salut Karim,

Tu m as demandé un tunnel Cloudflare pour tester CaftanRH à distance.
Le classifier de sécurité m a empêché de le lancer moi-même (exposition
du dev server avec credentials Supabase/Tuya/DocuSeal sur internet
public = risque sécurité).

Tu peux le lancer toi-même en 30 secondes :

═════════ OPTION A — Commande directe (PowerShell) ═════════

Ouvre PowerShell et lance :

    C:\\Users\\KElba\\cloudflared.exe tunnel --url http://localhost:3000

Attends ~5 secondes, copie l URL qui apparaît (format
https://XXXXXXX.trycloudflare.com).

═════════ OPTION B — Script tunnel-keeper.ps1 (auto-relance) ═════════

Le projet a deja un script qui maintient le tunnel actif et publie
automatiquement l URL sur GitHub a chaque restart. Plus robuste.

    cd C:\\Users\\KElba\\Documents\\GitHub\\Formulaire_candidats\\caftan-rh
    powershell -ExecutionPolicy Bypass -File scripts/tunnel-keeper.ps1

L URL active est aussi visible en permanence sur :
https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt

═════════ ÉTAPES TEST À DISTANCE ═════════

1. Lance le tunnel (option A ou B)
2. Note l URL (ex: https://abc-def-ghi.trycloudflare.com)
3. Sur ton iPhone / autre device :
   - Ouvre https://<url>/login
   - Login : elbazikarim@gmail.com + ton mot de passe (reset recemment)
   - Test
4. Quand fini, ferme la commande PowerShell pour stopper le tunnel

═════════ ATTENTION SECURITE ═════════

- Le tunnel expose ton dev server avec TOUS tes credentials
- Ne partage l URL avec personne d autre
- Coupe le tunnel quand tu as fini
- Évite de lancer si tu n es pas devant ton PC

═════════ Etat actuel CaftanRH (29/05 ~22h45) ═════════

✓ Layout v6 (commit 6d03acd revert) - état du mail "majestueux" 21:54
✓ Markdown templates restaure pixel-perfect
✓ Code source = état 22h01 (db6cdde HEAD)

⏳ Agent V8 layout en cours (lecture pixel-pres PDF originaux + mesures
   precises 15 parametres + preview HTML pour validation visuelle).
   Je te notifie des qu il a livre.

A +,
Claude
`;

const params = {
  to_email: "elbazikarim@gmail.com", email: "elbazikarim@gmail.com",
  user_email: "elbazikarim@gmail.com", candidate_email: "elbazikarim@gmail.com",
  to: "elbazikarim@gmail.com", to_name: "Karim", name: "Karim", candidate_name: "Karim",
  from_name: "Caftan Factory (By AMD Megastore)",
  reply_to: "hr@caftanfactory.com",
  subject, message: body, html_message: body.replace(/\n/g, "<br>"),
  body, html: body.replace(/\n/g, "<br>"), content: body,
};
const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
});
console.log(`Status: ${res.status} | ${await res.text()}`);
