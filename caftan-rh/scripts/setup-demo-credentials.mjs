#!/usr/bin/env node
// Reset le password admin (elbazikarim@gmail.com) à un mot de passe connu
// + crée/reset un compte employé de démo lié à un employee actif.
//
// Idempotent. À ne lancer que sur l'environnement de dev.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL = "elbazikarim@gmail.com";
const ADMIN_PWD = "Admin2026!";

const EMP_EMAIL = "demo-employee@caftanfactory.local";
const EMP_PWD = "Employe2026!";

const CAND_EMAIL = "demo-candidate@caftanfactory.local";
const CAND_PWD = "Candidat2026!";

async function findUserByEmail(email) {
  // Pas d'API directe pour chercher par email côté admin SDK avant v2.
  // On pagine.
  let page = 1;
  while (page < 50) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break;
    page++;
  }
  return null;
}

async function setAdminPassword() {
  console.log(`\n→ Admin: ${ADMIN_EMAIL}`);
  const u = await findUserByEmail(ADMIN_EMAIL);
  if (!u) {
    console.error(`  ✗ Compte admin introuvable. Crée-le manuellement.`);
    return;
  }
  const { error } = await supabase.auth.admin.updateUserById(u.id, {
    password: ADMIN_PWD,
    email_confirm: true,
  });
  if (error) {
    console.error(`  ✗ Reset password admin : ${error.message}`);
    return;
  }
  console.log(`  ✓ Password admin réinitialisé.`);
}

async function setupDemoEmployee() {
  console.log(`\n→ Employé démo: ${EMP_EMAIL}`);

  // 1. Cherche/crée le user auth
  let user = await findUserByEmail(EMP_EMAIL);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMP_EMAIL,
      password: EMP_PWD,
      email_confirm: true,
      user_metadata: { full_name: "Demo Employée" },
    });
    if (error) {
      console.error(`  ✗ Création user : ${error.message}`);
      return;
    }
    user = data.user;
    console.log(`  + User créé.`);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: EMP_PWD,
      email_confirm: true,
    });
    if (error) {
      console.error(`  ✗ Reset password : ${error.message}`);
      return;
    }
    console.log(`  ↻ Password réinitialisé.`);
  }

  // 2. Profile (rôle = candidate — c'est le rôle par défaut côté employés
  // puisque l'app distingue admin/rh/manager des autres profils via la
  // présence d'un employees row lié.)
  const { error: pErr } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: "Demo Employée",
        email: EMP_EMAIL,
        role: "candidate",
      },
      { onConflict: "id" },
    );
  if (pErr) {
    console.error(`  ⚠ Profile : ${pErr.message}`);
  } else {
    console.log(`  ✓ Profile rôle=employee.`);
  }

  // 3. Employee (rattache à un employees row, sinon en créer un actif)
  const { data: existing } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing) {
    console.log(`  ↻ Lié à employees row existant: ${existing.full_name}`);
    return;
  }

  // Cherche un employee actif sans profile_id qu'on peut rattacher
  const { data: orphan } = await supabase
    .from("employees")
    .select("id, full_name")
    .is("profile_id", null)
    .eq("status", "active")
    .order("full_name")
    .limit(1)
    .maybeSingle();

  if (orphan) {
    const { error: linkErr } = await supabase
      .from("employees")
      .update({ profile_id: user.id })
      .eq("id", orphan.id);
    if (linkErr) {
      console.error(`  ⚠ Lien employees : ${linkErr.message}`);
    } else {
      console.log(`  ✓ Lié à employees row: ${orphan.full_name}`);
    }
    return;
  }

  // Sinon crée un employee de démo
  const { error: empErr } = await supabase.from("employees").insert({
    profile_id: user.id,
    full_name: "Demo Employée",
    email: EMP_EMAIL,
    job_title: "Vendeuse (démo)",
    contract_type: "CDI",
    weekly_hours: 38,
    status: "active",
    start_date: new Date().toISOString().slice(0, 10),
  });
  if (empErr) {
    console.error(`  ⚠ Création employees row : ${empErr.message}`);
  } else {
    console.log(`  ✓ Employees row créé.`);
  }
}

async function setupDemoCandidate() {
  console.log(`\n→ Candidat démo: ${CAND_EMAIL}`);

  let user = await findUserByEmail(CAND_EMAIL);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: CAND_EMAIL,
      password: CAND_PWD,
      email_confirm: true,
      user_metadata: { full_name: "Demo Candidat" },
    });
    if (error) {
      console.error(`  ✗ Création user : ${error.message}`);
      return;
    }
    user = data.user;
    console.log(`  + User créé.`);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: CAND_PWD,
      email_confirm: true,
    });
    if (error) {
      console.error(`  ✗ Reset password : ${error.message}`);
      return;
    }
    console.log(`  ↻ Password réinitialisé.`);
  }

  // Profile
  const { error: pErr } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: "Demo Candidat",
        email: CAND_EMAIL,
        role: "candidate",
      },
      { onConflict: "id" },
    );
  if (pErr) {
    console.error(`  ⚠ Profile : ${pErr.message}`);
  } else {
    console.log(`  ✓ Profile rôle=candidate.`);
  }

  // Cherche/crée un candidates row + une candidature
  const { data: existing } = await supabase
    .from("candidates")
    .select("id, full_name")
    .eq("email", CAND_EMAIL)
    .maybeSingle();

  let candidateId = existing?.id ?? null;
  if (!candidateId) {
    const { data: created, error: cErr } = await supabase
      .from("candidates")
      .insert({
        email: CAND_EMAIL,
        full_name: "Demo Candidat",
        phone: "+32 470 00 00 00",
        city: "Bruxelles",
        country: "BE",
        source: "demo",
      })
      .select("id")
      .single();
    if (cErr) {
      console.error(`  ⚠ candidates row : ${cErr.message}`);
      return;
    }
    candidateId = created.id;
    console.log(`  ✓ candidates row créé.`);
  } else {
    console.log(`  ↻ candidates row existant.`);
  }

  // Lie le profile au candidates row si la colonne existe
  await supabase
    .from("candidates")
    .update({ profile_id: user.id })
    .eq("id", candidateId);

  // Une application liée pour qu'il voie quelque chose dans /me
  const { data: existingApp } = await supabase
    .from("applications")
    .select("id")
    .eq("candidate_id", candidateId)
    .limit(1)
    .maybeSingle();
  if (!existingApp) {
    await supabase.from("applications").insert({
      candidate_id: candidateId,
      job_id: null,
      status: "new",
      motivation:
        "Bonjour, je suis très intéressé(e) par les postes en boutique chez Caftan Factory. Disponible immédiatement, multilingue (FR/AR/NL), expérience en service client.",
    });
    console.log(`  ✓ application créée.`);
  } else {
    console.log(`  ↻ application existante.`);
  }
}

await setAdminPassword();
await setupDemoEmployee();
await setupDemoCandidate();

console.log(`\n========================================`);
console.log(`Identifiants prêts :`);
console.log(``);
console.log(`  ADMIN`);
console.log(`    URL    → http://localhost:3000/login`);
console.log(`    Email  → ${ADMIN_EMAIL}`);
console.log(`    Pwd    → ${ADMIN_PWD}`);
console.log(``);
console.log(`  EMPLOYÉ (démo)`);
console.log(`    URL    → http://localhost:3000/login`);
console.log(`    Email  → ${EMP_EMAIL}`);
console.log(`    Pwd    → ${EMP_PWD}`);
console.log(``);
console.log(`  CANDIDAT (démo)`);
console.log(`    URL    → http://localhost:3000/login`);
console.log(`    Email  → ${CAND_EMAIL}`);
console.log(`    Pwd    → ${CAND_PWD}`);
console.log(`========================================`);
