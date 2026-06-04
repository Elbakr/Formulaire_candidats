#!/usr/bin/env node
// Karim 2026-06-04 : diag complet de la chaine GF -> Supabase.
// 1. Lit gf_settings (enabled, ck/cs presents, last_synced_at).
// 2. Fetch dernier paquet GF (50 dernieres entries).
// 3. Compare ids GF vs candidates(gf_entry_id) en BD.
// 4. Affiche les manquants + les raisons probables (email/nom invalide).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: settings } = await sb.from("gf_settings").select("*").eq("id", 1).single();
if (!settings) { console.error("Pas de gf_settings"); process.exit(1); }

console.log("════ gf_settings ════");
console.log(`  enabled         : ${settings.enabled}`);
console.log(`  wp_url          : ${settings.wp_url}`);
console.log(`  form_id         : ${settings.form_id}`);
console.log(`  ck              : ${settings.ck ? "SET" : "MISSING"}`);
console.log(`  cs              : ${settings.cs ? "SET" : "MISSING"}`);
console.log(`  last_synced_at  : ${settings.last_synced_at ?? "JAMAIS"}`);
console.log(`  last_sync_count : ${settings.last_sync_count ?? 0}`);
console.log(`  field_map keys  : ${Object.keys(settings.field_map ?? {}).join(", ")}`);

if (!settings.ck || !settings.cs) {
  console.error("\n❌ Credentials manquants - sync impossible.");
  process.exit(1);
}

const auth = Buffer.from(`${settings.ck}:${settings.cs}`).toString("base64");
const fm = settings.field_map;

// Sort par date_created descendant pour avoir les plus recents.
const url = `${settings.wp_url.replace(/\/$/, "")}/wp-json/gf/v2/entries?form_ids[]=${settings.form_id}&paging[page_size]=50&paging[current_page]=1&sorting[key]=date_created&sorting[direction]=DESC`;
console.log(`\n════ Fetch GF (50 dernieres) ════`);
const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
console.log(`  HTTP ${r.status}`);
if (!r.ok) { console.error(await r.text()); process.exit(1); }
const j = await r.json();
const entries = j.entries ?? [];
const total = Number(j.total_count ?? entries.length);
console.log(`  total_count (form) : ${total}`);
console.log(`  recus dans page 1  : ${entries.length}`);

if (entries.length === 0) { console.log("Aucune entree GF."); process.exit(0); }

// Affiche les 10 plus recentes
console.log(`\n════ 10 dernieres GF entries ════`);
for (const e of entries.slice(0, 10)) {
  const fn = (fm.firstname ? e[fm.firstname] : "") ?? "";
  const ln = (fm.lastname ? e[fm.lastname] : "") ?? "";
  const em = (fm.email ? e[fm.email] : "") ?? "";
  console.log(`  ${String(e.id).padStart(5)} | ${e.date_created} | ${fn} ${ln} | ${em}`);
}

// Compare avec BD
const ids = entries.map((e) => String(e.id));
const { data: existing } = await sb.from("candidates").select("gf_entry_id, full_name, email, applied_at").in("gf_entry_id", ids);
const existingSet = new Set((existing ?? []).map((c) => String(c.gf_entry_id)));
const missing = entries.filter((e) => !existingSet.has(String(e.id)));

console.log(`\n════ Diff GF vs candidates ════`);
console.log(`  en BD            : ${existingSet.size} / ${entries.length}`);
console.log(`  MANQUANTS        : ${missing.length}`);

if (missing.length > 0) {
  console.log(`\n  ── Detail manquants (raison) ──`);
  for (const e of missing) {
    const fn = (fm.firstname ? e[fm.firstname] : "") ?? "";
    const ln = (fm.lastname ? e[fm.lastname] : "") ?? "";
    const em = ((fm.email ? e[fm.email] : "") ?? "").toLowerCase().trim();
    const fullName = `${fn} ${ln}`.trim();
    let reason = "OK -> a inserer";
    if (!em) reason = "❌ email vide";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) reason = `❌ email invalide : ${em}`;
    else if (!fullName) reason = "❌ nom complet vide";
    console.log(`  ${String(e.id).padStart(5)} | ${e.date_created} | ${fullName.padEnd(30)} | ${em.padEnd(35)} | ${reason}`);
  }
}

// Verifie dernier candidate en BD pour info
const { data: lastCand } = await sb
  .from("candidates")
  .select("gf_entry_id, full_name, email, applied_at, created_at")
  .eq("source", "gravity_forms")
  .order("applied_at", { ascending: false })
  .limit(5);
console.log(`\n════ 5 derniers candidates GF en BD (par applied_at desc) ════`);
for (const c of (lastCand ?? [])) {
  console.log(`  ${String(c.gf_entry_id).padStart(5)} | ${c.applied_at} | ${c.full_name} | ${c.email}`);
}
