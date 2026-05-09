#!/usr/bin/env node
// Promeut un email en rôle admin. Crée le compte avec un mot de passe temporaire si absent.
// Usage: node scripts/make-admin.mjs <email>

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
function genPassword(len = 14) {
  const b = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHA[b[i] % ALPHA.length];
  return s;
}

async function findUser(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((u) => u.email?.toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  let user = await findUser(email);
  let tempPassword = null;

  if (!user) {
    tempPassword = genPassword();
    console.log(`→ Pas de compte pour ${email}, je le crée…`);
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (error) { console.error("Échec création:", error.message); process.exit(1); }
    user = data.user;
  } else {
    console.log(`· Compte existant pour ${email} (id=${user.id})`);
  }

  // Promouvoir le profile en admin
  const { error: upErr } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", user.id);
  if (upErr) { console.error("Échec promotion:", upErr.message); process.exit(1); }

  console.log("");
  console.log("✓ Promu admin.");
  console.log(`  Email : ${email}`);
  if (tempPassword) {
    console.log(`  Mot de passe temporaire : ${tempPassword}`);
    console.log("  (à changer à la première connexion via Supabase ou /me/profile)");
  } else {
    console.log("  (mot de passe inchangé — utilise celui que tu as déjà)");
  }
  console.log(`  → Connecte-toi sur http://localhost:3000/login`);
}

main().catch((e) => { console.error(e); process.exit(1); });
