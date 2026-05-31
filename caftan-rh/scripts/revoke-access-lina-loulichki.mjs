#!/usr/bin/env node
// Karim 2026-05-30 : revoque l acces du compte cree par inadvertance pour
// Lina Loulichki (auth.user + profile via cascade). Garde la fiche employee
// + candidate pour tracabilite (profile_id mise a null).

import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const TARGET_USER_ID = "32543d68-ab13-40e9-9181-1fbb24e26895";
const TARGET_EMAIL = "lina.loulichki77@hotmail.com";
const EMPLOYEE_ID = "0cda7145-0551-450b-98af-0a9bcff67688";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log("=== Etat AVANT ===");
const { data: before } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const userBefore = before.users.find((u) => u.id === TARGET_USER_ID);
console.log("auth.user : " + (userBefore ? userBefore.email + " (cree " + userBefore.created_at + ")" : "INTROUVABLE"));
const { rows: empBefore } = await c.query("select id, full_name, profile_id, status from employees where id = $1", [EMPLOYEE_ID]);
console.log("employee : " + JSON.stringify(empBefore[0]));

// 1. Detache la fiche employee du profile (avant cascade delete)
await c.query("update employees set profile_id = null, updated_at = now() where id = $1", [EMPLOYEE_ID]);
console.log("\n✓ employees.profile_id mis a null");

// 2. Supprime l auth.user (cascade va supprimer le profile)
const { error: delErr } = await sb.auth.admin.deleteUser(TARGET_USER_ID);
if (delErr) { console.error("Delete auth.user FAILED:", delErr.message); process.exit(1); }
console.log("✓ auth.user supprime");

// 3. Verifie
console.log("\n=== Etat APRES ===");
const { data: after } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const userAfter = after.users.find((u) => u.id === TARGET_USER_ID);
console.log("auth.user : " + (userAfter ? "TOUJOURS PRESENT (erreur)" : "Supprime ✓"));
const { rows: empAfter } = await c.query("select id, full_name, profile_id, status from employees where id = $1", [EMPLOYEE_ID]);
console.log("employee : " + JSON.stringify(empAfter[0]));
const { rows: profAfter } = await c.query("select count(*) as n from profiles where id = $1", [TARGET_USER_ID]);
console.log("profile : " + (profAfter[0].n === "0" || profAfter[0].n === 0 ? "Supprime (cascade) ✓" : "TOUJOURS PRESENT"));

await c.end();
console.log(`\n✅ Acces revoque pour ${TARGET_EMAIL}`);
console.log(`   La fiche employee (Lina Loulichki) est conservee, juste detachee du compte auth.`);
console.log(`   Si tu veux re-creer un compte plus tard, fais-le via l UI ou un nouveau script.`);
