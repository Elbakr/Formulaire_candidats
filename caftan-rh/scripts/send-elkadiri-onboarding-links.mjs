#!/usr/bin/env node
// Karim 2026-05-30 : envoie mail recap a K. Elkadiri (elbazikarim@hotmail.fr)
// avec tous les liens self-service candidat/employee pour completer sa fiche
// + magic link auto-login.

import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const TARGET_EMAIL = "elbazikarim@hotmail.fr";
const TARGET_USER_ID = "d1f8b950-2f39-4a86-921b-0dda5cb23919";
const TUNNEL = "https://poll-fcc-rough-constructed.trycloudflare.com";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Magic link auto-login
const { data: link, error } = await sb.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
  options: { redirectTo: `${TUNNEL}/me/onboarding` },
});
if (error) { console.error("Magic link failed:", error.message); process.exit(1); }
const magicLink = link.properties.action_link;
console.log("Magic link genere (1h valid)");

const subject = `CaftanRH - Tes liens pour compléter ta fiche (contrat + Dimona)`;
const body = `Bonjour,

Pour générer ton contrat de travail et envoyer ta Dimona, il te reste
quelques informations à compléter dans ton espace personnel.

═══════ AUTO-LOGIN (clique le premier, valable 1h) ═══════

👉 ${magicLink}

Tu seras directement connecté à ton espace, sans mot de passe.

═══════ TOUTES TES URLs SELF-SERVICE ═══════

🔗 Mon profil (compléter NRN, IBAN, date naissance, adresse) :
   ${TUNNEL}/me/profile

🔗 Mon onboarding (checklist + documents à fournir) :
   ${TUNNEL}/me/onboarding

🔗 Mes documents (carte ID, certificat médical, etc.) :
   ${TUNNEL}/me/documents

🔗 Mes candidatures (historique) :
   ${TUNNEL}/me

🔗 Postuler à une autre offre (formulaire public) :
   ${TUNNEL}/postuler

🔗 Login normal (avec ton mot de passe) :
   ${TUNNEL}/login

═══════ ÉTAT DE TA FICHE ═══════

✓ Email : elbazikarim@hotmail.fr
✓ NRN : 32.54.56-414.56
✓ IBAN : BE02 5547 7547 7454 2547
✓ Adresse : 222 rue verte, 1030 Schaerbeek
✓ Date début : 2026-06-05
✓ Contrat : CDD
⚠ Date de naissance : MANQUANTE (à compléter pour Dimona)

═══════ APRÈS COMPLÉTION ═══════

1. Tu cliques le magic link ci-dessus
2. Tu vas sur /me/profile → ajoute ta date de naissance
3. Sauvegarde
4. CaftanRH te renvoie automatiquement ton contrat à signer

═══════ TUNNEL ═══════

URL active : ${TUNNEL}
Tunnel testé et fonctionnel (HTTP 200 sur toutes les pages).
L URL change si le PC de Karim redémarre - cherche le tunnel à jour
ici : https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt

A bientôt,
CaftanRH
`;

const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

const params = {
  to_email: TARGET_EMAIL, email: TARGET_EMAIL, user_email: TARGET_EMAIL, candidate_email: TARGET_EMAIL,
  to: TARGET_EMAIL, to_name: "K. Elkadiri", name: "K. Elkadiri", candidate_name: "K. Elkadiri",
  from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
  subject, message: body, html_message: body.replace(/\n/g, "<br>"),
  body, html: body.replace(/\n/g, "<br>"), content: body,
  magic_link: magicLink,
};

const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
});
console.log(`Mail envoye : HTTP ${res.status}`);
if (res.status !== 200) {
  console.error("Body:", (await res.text()).slice(0, 200));
}
console.log(`\nDestinataire : ${TARGET_EMAIL}`);
console.log(`Tunnel actif : ${TUNNEL}`);
console.log(`Magic link valid 1h`);
