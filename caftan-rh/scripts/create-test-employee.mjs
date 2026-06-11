#!/usr/bin/env node
// Karim 2026-06-11 : cree un compte EMPLOYE de test (alias Gmail +test -> meme
// boite que l'admin) pour tester chat WhatsApp + push a 2 comptes.
// Idempotent. Usage : node scripts/create-test-employee.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const ADMIN_EMAIL = "elbazikarim@gmail.com";
const TEST_EMAIL = "elbazikarim+test@gmail.com";
const TEST_NAME = "Employé Test";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
function genPassword(len = 12) {
  const b = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHA[b[i] % ALPHA.length];
  return s;
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 10; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    const u = (data?.users ?? []).find((x) => (x.email ?? "").toLowerCase() === email.toLowerCase());
    if (u) return u;
    if ((data?.users ?? []).length < 200) break;
  }
  return null;
}

// 1) Auth user (cree ou recupere) + (re)set password
const password = genPassword();
let userId;
const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email: TEST_EMAIL,
  password,
  email_confirm: true,
});
if (createErr) {
  const existing = await findUserByEmail(TEST_EMAIL);
  if (!existing) throw new Error(`createUser: ${createErr.message} (et introuvable)`);
  userId = existing.id;
  await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
  console.log("Compte auth deja existant -> mot de passe reinitialise.");
} else {
  userId = created.user.id;
  console.log("Compte auth cree.");
}

// 2) Profil (role candidate = vue employe /me)
await supabase.from("profiles").upsert({ id: userId, email: TEST_EMAIL, role: "candidate", full_name: TEST_NAME }, { onConflict: "id" });

// 3) Fiche employe (liee au profil)
const { data: existingEmp } = await supabase.from("employees").select("id").eq("profile_id", userId).maybeSingle();
let employeeId = existingEmp?.id;
if (!employeeId) {
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .insert({ profile_id: userId, email: TEST_EMAIL, full_name: TEST_NAME, status: "active" })
    .select("id")
    .single();
  if (empErr) throw new Error(`employee insert: ${empErr.message}`);
  employeeId = emp.id;
  console.log("Fiche employe creee.");
} else {
  console.log("Fiche employe deja existante.");
}

// 4) Chat DM admin <-> employe test
const { data: admin } = await supabase.from("profiles").select("id, full_name").eq("email", ADMIN_EMAIL).maybeSingle();
let dmRoomId = null;
if (admin) {
  // cherche un DM existant entre les 2
  const { data: rooms } = await supabase.from("chat_rooms").select("id, members:chat_room_members(profile_id)").eq("kind", "dm");
  const found = (rooms ?? []).find((r) => {
    const ids = new Set((r.members ?? []).map((m) => m.profile_id));
    return ids.size === 2 && ids.has(admin.id) && ids.has(userId);
  });
  if (found) { dmRoomId = found.id; }
  else {
    const { data: room } = await supabase.from("chat_rooms")
      .insert({ kind: "dm", name: `${admin.full_name ?? "Admin"} ↔ ${TEST_NAME}`, created_by: admin.id })
      .select("id").single();
    dmRoomId = room.id;
    await supabase.from("chat_room_members").insert([
      { room_id: dmRoomId, profile_id: admin.id, role: "admin" },
      { room_id: dmRoomId, profile_id: userId, role: "member" },
    ]);
    console.log("Chat DM admin <-> employe test cree.");
  }
}

console.log("\n========================================");
console.log("  COMPTE EMPLOYE DE TEST");
console.log("========================================");
console.log("  Email    :", TEST_EMAIL);
console.log("  Password :", password);
console.log("  URL      : https://caftan-rh.vercel.app/login");
console.log("  Role     : employe (candidate) -> vue /me");
console.log("  DM chat  :", dmRoomId ? "OK avec ton compte admin" : "(admin introuvable)");
console.log("========================================");
console.log("Les mails (magic link, notifs) arrivent dans elbazikarim@gmail.com (alias +test).");
