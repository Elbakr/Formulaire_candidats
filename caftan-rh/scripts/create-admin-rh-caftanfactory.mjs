#!/usr/bin/env node
// Karim 2026-05-30 : cree le compte hr@caftanfactory.com en admin + envoie
// magic link via EmailJS (bypass rate limit Supabase SMTP).
// Auto-elevation via la table admin_emails (deja seedee dans la migration).

import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const TARGET_EMAIL = "hr@caftanfactory.com";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

if (!SUPA_URL || !SVC_KEY) { console.error("Supabase env manquant"); process.exit(1); }
if (!SERVICE || !TEMPLATE || !KEY) { console.error("EmailJS env manquant"); process.exit(1); }

const sb = createClient(SUPA_URL, SVC_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// 1. Cherche si user existe deja
const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const existing = list.users.find((u) => u.email?.toLowerCase() === TARGET_EMAIL.toLowerCase());

let userId;
if (existing) {
  userId = existing.id;
  console.log(`User existe deja : ${userId}`);
} else {
  // Cree le user avec email confirme (skip etape email verification)
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email: TARGET_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: "HR Caftan Factory" },
  });
  if (cErr) { console.error("Creation failed:", cErr); process.exit(1); }
  userId = created.user.id;
  console.log(`User cree : ${userId}`);
}

// 2. Force le role admin (au cas ou le trigger ne l a pas attrape)
const { error: roleErr } = await sb
  .from("profiles")
  .upsert({ id: userId, email: TARGET_EMAIL, full_name: "HR Caftan Factory", role: "admin" }, { onConflict: "id" });
if (roleErr) console.error("Profile upsert warning:", roleErr.message);
console.log("Role admin force OK");

// 3. Genere un magic link pour qu il puisse se logger + set un password
const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
  options: { redirectTo: "http://localhost:3000/login/reset-password" },
});
if (linkErr || !link?.properties?.action_link) {
  console.error("generateLink failed:", linkErr);
  process.exit(1);
}
const magicLink = link.properties.action_link;
console.log(`Magic link genere (valide 1h)`);

// 4. Envoie via EmailJS
const subject = "CaftanRH - Bienvenue HR Caftan Factory (accès admin)";
const body = `Bonjour,

Un compte administrateur a été créé pour vous sur CaftanRH avec l adresse
${TARGET_EMAIL}.

Pour finaliser l acces et choisir votre mot de passe, cliquez sur le lien
ci-dessous (valable 1 heure) :

👉 ${magicLink}

Une fois connecté, vous accederez au tableau de bord admin complet :
- Planning + employees
- Fiches de paie + QR EPC SEPA
- Contrats + signature DocuSeal
- Documents centralises

Si vous n etes pas a l origine de cette demande, ignorez ce mail.

A bientot,
CaftanRH
`;

const params = {
  to_email: TARGET_EMAIL, email: TARGET_EMAIL, user_email: TARGET_EMAIL, candidate_email: TARGET_EMAIL,
  to: TARGET_EMAIL, to_name: "HR Caftan Factory", name: "HR", candidate_name: "HR Caftan Factory",
  from_name: "Caftan Factory (By AMD Megastore)",
  reply_to: "elbazikarim@gmail.com",
  subject, message: body, html_message: body.replace(/\n/g, "<br>"),
  body, html: body.replace(/\n/g, "<br>"), content: body,
};
const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: KEY, template_params: params }),
});
console.log(`Mail envoye : HTTP ${res.status}`);

console.log(`\n✅ Compte ${TARGET_EMAIL} pret. Magic link envoye dans la boite.`);
console.log(`Profile : role=admin, id=${userId}`);
