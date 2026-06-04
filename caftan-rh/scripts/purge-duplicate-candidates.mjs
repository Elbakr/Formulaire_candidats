#!/usr/bin/env node
// Karim 2026-06-04 : script CLI de purge des doublons candidates.
// Detection multi-critere (email / phone / nom+naissance) + merge auto
// avec keeper = candidate avec le plus de donnees + applied_at plus recent.
//
// Usage :
//   node scripts/purge-duplicate-candidates.mjs           # DRY RUN (par defaut)
//   node scripts/purge-duplicate-candidates.mjs --apply   # execute reellement
//
// Toutes les FK (applications, documents, screening, shifts, employees, mails)
// sont transferees vers le keeper avant DELETE - aucune perte metier.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const APPLY = process.argv.includes("--apply");
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FK_TABLES = [
  { table: "applications", column: "candidate_id" },
  { table: "documents", column: "candidate_id" },
  { table: "document_upload_tokens", column: "candidate_id" },
  { table: "screening_responses", column: "candidate_id" },
  { table: "shifts", column: "candidate_id" },
  { table: "employees", column: "candidate_id" },
  { table: "ai_assistant_conversations", column: "candidate_id" },
  { table: "outbound_mails", column: "candidate_id" },
  { table: "document_audit_log", column: "candidate_id" },
];

function digitsOnly(s) { return (s ?? "").replace(/\D/g, ""); }
function normalizeName(s) {
  return (s ?? "").toLowerCase().trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}
function dataCount(c) {
  return [c.email, c.full_name, c.phone, c.birth_date, c.postal_code, c.city, c.cv_url, c.profile_id, c.gf_entry_id]
    .filter(Boolean).length;
}

const { data: candidates } = await sb
  .from("candidates")
  .select("id, email, full_name, phone, birth_date, postal_code, city, source, applied_at, gf_entry_id, profile_id, cv_url")
  .order("applied_at", { ascending: false })
  .limit(10000);

console.log(`${candidates.length} candidates charges.`);
console.log(`Mode : ${APPLY ? "🔥 APPLY (modifications reelles)" : "📋 DRY RUN (lecture seule, passe --apply pour executer)"}`);

const byEmail = new Map();
const byPhone = new Map();
const byNameBirth = new Map();
for (const c of candidates) {
  if (c.email) {
    const k = c.email.toLowerCase().trim();
    if (!byEmail.has(k)) byEmail.set(k, []);
    byEmail.get(k).push(c);
  }
  const ph = digitsOnly(c.phone);
  if (ph.length >= 7) {
    const n = ph.startsWith("0032") ? "0" + ph.slice(4) : ph.startsWith("32") && ph.length >= 11 ? "0" + ph.slice(2) : ph;
    if (!byPhone.has(n)) byPhone.set(n, []);
    byPhone.get(n).push(c);
  }
  if (c.full_name && c.birth_date) {
    const k = `${normalizeName(c.full_name)}|${c.birth_date}`;
    if (!byNameBirth.has(k)) byNameBirth.set(k, []);
    byNameBirth.get(k).push(c);
  }
}

const groups = [];
const seenIdsKeys = new Set();
function addGroup(criterion, key, list) {
  if (list.length < 2) return;
  const idsKey = [...list.map((c) => c.id)].sort().join(",");
  if (seenIdsKeys.has(idsKey)) return;
  seenIdsKeys.add(idsKey);
  list.sort((a, b) => {
    const da = dataCount(a) - dataCount(b);
    if (da !== 0) return -da;
    const ta = a.applied_at ? new Date(a.applied_at).getTime() : 0;
    const tb = b.applied_at ? new Date(b.applied_at).getTime() : 0;
    return tb - ta;
  });
  groups.push({ criterion, key, list });
}
for (const [k, l] of byEmail) addGroup("email", k, l);
for (const [k, l] of byPhone) addGroup("phone", k, l);
for (const [k, l] of byNameBirth) addGroup("name+birth", k, l);

console.log(`\n${groups.length} groupes de doublons (${groups.reduce((s, g) => s + g.list.length - 1, 0)} rows a fusionner).\n`);

let merged = 0;
let errors = 0;

for (const g of groups) {
  const keeper = g.list[0];
  const dupes = g.list.slice(1);
  const dupesIds = dupes.map((c) => c.id);
  console.log(`[${g.criterion}] ${g.key}`);
  console.log(`  KEEP   : ${keeper.full_name} (${keeper.email}) - ${dataCount(keeper)} champs`);
  for (const d of dupes) {
    console.log(`  REMOVE : ${d.full_name} (${d.email}) - ${dataCount(d)} champs`);
  }

  if (!APPLY) continue;

  // Transfere FK
  const transferred = {};
  let fkFailed = false;
  for (const fk of FK_TABLES) {
    const { error, count } = await sb
      .from(fk.table)
      .update({ [fk.column]: keeper.id }, { count: "exact" })
      .in(fk.column, dupesIds);
    if (error) {
      console.log(`    ⚠ FK ${fk.table}.${fk.column}: ${error.message}`);
      transferred[fk.table] = "ERR";
      continue;
    }
    transferred[fk.table] = count ?? 0;
  }
  if (fkFailed) { errors += 1; continue; }

  // Delete dupes
  const { error: delErr, count: delCount } = await sb
    .from("candidates")
    .delete({ count: "exact" })
    .in("id", dupesIds);
  if (delErr) {
    console.log(`    ❌ DELETE: ${delErr.message}`);
    errors += 1;
    continue;
  }
  const tr = Object.entries(transferred).filter(([, v]) => v && v !== 0 && v !== "ERR").map(([k, v]) => `${k}:${v}`).join(", ");
  console.log(`    ✓ ${delCount} delete. FK: ${tr || "aucun"}`);
  merged += delCount ?? 0;
}

console.log(`\n${APPLY ? "✓ Fait" : "DRY RUN"} : ${merged} rows fusionnees, ${errors} erreurs sur ${groups.length} groupes.`);
if (!APPLY) console.log(`\nRelance avec --apply pour executer pour de vrai.`);
