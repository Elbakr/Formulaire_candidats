#!/usr/bin/env node
// Karim 2026-06-03 : cree le compte kamal@elbazi.com en admin + worker
// avec language_preference=nl. Mot de passe passe en argument CLI pour
// eviter de le commiter en clair :
//   node scripts/create-kamal-account.mjs '<password>'

import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const TARGET_EMAIL = "kamal@elbazi.com";
const FULL_NAME = "Kamal Elbazi";
const PASSWORD = process.argv[2];

if (!PASSWORD) {
  console.error("Usage : node scripts/create-kamal-account.mjs '<password>'");
  process.exit(1);
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SVC_KEY) { console.error("Supabase env manquant"); process.exit(1); }

const sb = createClient(SUPA_URL, SVC_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// 1. Cherche si user existe deja
const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const existing = list.users.find((u) => u.email?.toLowerCase() === TARGET_EMAIL.toLowerCase());

let userId;
if (existing) {
  userId = existing.id;
  // Update password + email_confirm si pas deja confirme
  await sb.auth.admin.updateUserById(userId, {
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });
  console.log(`User existe deja : ${userId} (password reset)`);
} else {
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email: TARGET_EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });
  if (cErr) { console.error("Creation failed:", cErr); process.exit(1); }
  userId = created.user.id;
  console.log(`User cree : ${userId}`);
}

// 2. Force role=admin + language_preference=nl
const { error: roleErr } = await sb
  .from("profiles")
  .upsert({
    id: userId,
    email: TARGET_EMAIL,
    full_name: FULL_NAME,
    role: "admin",
    language_preference: "nl",
  }, { onConflict: "id" });
if (roleErr) console.error("Profile upsert warning:", roleErr.message);
console.log("Profile : role=admin language=nl");

// 3. Cree aussi un employee actif lie a son profile pour qu'il puisse tester
//    cote travailleur (/me/* avec ses propres prestations / fiches paie).
const { data: existingEmp } = await sb
  .from("employees")
  .select("id, full_name")
  .eq("profile_id", userId)
  .maybeSingle();

let employeeId;
if (existingEmp) {
  employeeId = existingEmp.id;
  await sb.from("employees").update({
    full_name: FULL_NAME,
    email: TARGET_EMAIL,
    status: "active",
    preferred_language: "nl",
  }).eq("id", employeeId);
  console.log(`Employee existe : ${employeeId} (mise a jour)`);
} else {
  const today = new Date().toISOString().slice(0, 10);
  const { data: empCreated, error: empErr } = await sb
    .from("employees")
    .insert({
      profile_id: userId,
      full_name: FULL_NAME,
      email: TARGET_EMAIL,
      status: "active",
      preferred_language: "nl",
      contract_type: "CDD",
      work_time_kind: "part",
      weekly_hours: 19,
      hourly_rate: 14.5,
      start_date: today,
      job_title: "Test admin/worker",
    })
    .select("id")
    .single();
  if (empErr) { console.error("Employee creation failed:", empErr); process.exit(1); }
  employeeId = empCreated.id;
  console.log(`Employee cree : ${employeeId}`);
}

console.log(`\n✅ Compte Kamal pret`);
console.log(`   user_id     = ${userId}`);
console.log(`   employee_id = ${employeeId}`);
console.log(`   email       = ${TARGET_EMAIL}`);
console.log(`   role        = admin (+ employee actif)`);
console.log(`   language    = nl`);
