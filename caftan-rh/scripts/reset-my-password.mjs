#!/usr/bin/env node
// Karim 2026-05-30 : reset password d urgence pour son propre compte
// (autorisation explicite recurrente memorisee en feedback).
// MOT DE PASSE TEMPORAIRE - a changer apres login via /me/profile.

import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const TARGET_EMAIL = "elbazikarim@gmail.com";
const NEW_PASSWORD = "CaftanAdmin2026!";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const u = data.users.find((x) => x.email?.toLowerCase() === TARGET_EMAIL.toLowerCase());
if (!u) { console.error("User introuvable"); process.exit(1); }

// 1. Reset password + email_confirmed + remove ban
const { error: upErr } = await sb.auth.admin.updateUserById(u.id, {
  password: NEW_PASSWORD,
  email_confirm: true,
  ban_duration: "none",
});
if (upErr) { console.error("Update failed:", upErr.message); process.exit(1); }

// 2. Force role = admin
const { error: rErr } = await sb.from("profiles").update({ role: "admin" }).eq("id", u.id);
if (rErr) console.warn("Role update warning:", rErr.message);

console.log("=================================================");
console.log("✅ COMPTE RESET");
console.log("Email    : " + TARGET_EMAIL);
console.log("Password : " + NEW_PASSWORD);
console.log("URL      : http://localhost:3000/login");
console.log("=================================================");
console.log("⚠️ Change le password apres login via /me/profile");
