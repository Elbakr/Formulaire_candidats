#!/usr/bin/env node
// Karim 2026-06-01 : test diagnostic magic link.
// Genere un magic link Supabase pour elbazikarim@gmail.com,
// affiche le redirect_to qu il contient + envoie le lien par mail.
//
// Permet de verifier :
//   1. Vers OU le lien redirige reellement
//   2. Si Supabase a respecte le redirect_to demande
//   3. Si l URL finale ouvrable sur smartphone est bien le tunnel
//
// Usage : cd caftan-rh && node scripts/test-magic-link.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAILJS_SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const EMAILJS_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

if (!SUPA_URL || !SERVICE) {
  console.error("[X] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");

// 1. Lis le tunnel actif
let tunnel = "http://localhost:3000";
const tunnelFile = resolve(__dirname, "../TUNNEL_URL.txt");
if (existsSync(tunnelFile)) {
  const raw = readFileSync(tunnelFile, "utf8");
  const m = raw.match(/https?:\/\/[^\s]+\.trycloudflare\.com/);
  if (m) tunnel = m[0];
}
const redirectTo = `${tunnel}/me/profile`;
console.log("Tunnel actif :", tunnel);
console.log("Redirect demande :", redirectTo);

// 2. Genere magic link
const sb = createClient(SUPA_URL, SERVICE);
const email = "elbazikarim@gmail.com";
const { data: link, error: e1 } = await sb.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo },
});
if (e1 || !link?.properties?.action_link) {
  console.error("[X] generateLink error:", e1?.message ?? "no link");
  process.exit(1);
}
const magicLink = link.properties.action_link;
console.log("\n═══ MAGIC LINK GENERE ═══");
console.log(magicLink);

// 3. Decompose l URL pour voir le redirect_to embedded
try {
  const u = new URL(magicLink);
  console.log("\n═══ DIAGNOSTIC ═══");
  console.log("Host        :", u.host);
  console.log("Path        :", u.pathname);
  for (const [k, v] of u.searchParams.entries()) {
    if (v.length > 80) console.log(`${k.padEnd(12)}: ${v.slice(0, 80)}...`);
    else console.log(`${k.padEnd(12)}: ${v}`);
  }
  const redirectInUrl = u.searchParams.get("redirect_to") ?? u.searchParams.get("redirectTo");
  if (redirectInUrl) {
    if (redirectInUrl === redirectTo) {
      console.log("\n✓ Supabase a respecte le redirect_to demande");
    } else {
      console.log("\n⚠ Supabase a CHANGE le redirect_to :");
      console.log(`  Demande : ${redirectTo}`);
      console.log(`  Recu    : ${redirectInUrl}`);
      console.log("\n  → Probable cause : l URL n est pas dans l allowlist Supabase.");
      console.log("    Va sur https://supabase.com/dashboard → Authentication → URL Configuration");
      console.log("    et ajoute https://*.trycloudflare.com/** dans Redirect URLs.");
    }
  }
} catch (e) {
  console.warn("decompose KO :", e.message);
}

// 4. Envoie par mail si EmailJS configure
if (EMAILJS_SERVICE && EMAILJS_TEMPLATE && EMAILJS_KEY) {
  const body = `Test magic link :

${magicLink}

═══ ATTENDU ═══

1. Tu cliques sur le lien depuis ton smartphone
2. Tu es connecte auto sans password
3. Tu atterris sur : ${redirectTo}

═══ SI CA ATTERRIT SUR LOCALHOST:3000 ═══

→ Supabase a ignore le redirect_to demande car le tunnel n est pas
  dans la liste "Redirect URLs" du dashboard Supabase.

→ Fix : Authentication → URL Configuration → ajoute
  https://*.trycloudflare.com/**  dans Redirect URLs
  puis Save.
`;
  const params = {
    to_email: email,
    email,
    user_email: email,
    candidate_email: email,
    to: email,
    to_name: "Karim",
    name: "Karim",
    candidate_name: "Karim",
    from_name: "CaftanRH (test)",
    reply_to: "hr@caftanfactory.com",
    subject: "[Test] Magic link diagnostic",
    message: body,
    html_message: body.replace(/\n/g, "<br>"),
    body,
    content: body,
    html: body.replace(/\n/g, "<br>"),
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE,
      template_id: EMAILJS_TEMPLATE,
      user_id: EMAILJS_KEY,
      template_params: params,
    }),
  });
  console.log("\n═══ ENVOI MAIL ═══");
  console.log("Status:", res.status);
  if (!res.ok) {
    console.log("Erreur EmailJS :", await res.text());
  } else {
    console.log("✓ Mail envoye sur", email);
    console.log("  → Ouvre-le sur ton telephone et clique le lien.");
    console.log("  → Note l URL finale (apres redirect) et dis-moi.");
  }
} else {
  console.log("\nEmailJS non configure - copie le magic link a la main pour le tester.");
}
