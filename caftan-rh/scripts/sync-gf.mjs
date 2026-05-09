#!/usr/bin/env node
// Lance une sync GF en local (utilise les settings stockés en DB).
// Permet aussi de pré-remplir gf_settings avec valeurs ENV au premier appel.
// Usage: node scripts/sync-gf.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Si gf_settings n'a pas encore ck/cs et qu'on a des valeurs ENV → bootstrap
async function ensureSettings() {
  const { data: existing } = await supabase.from("gf_settings").select("*").eq("id", 1).single();
  const hasCreds = existing?.ck && existing?.cs;
  if (hasCreds) return existing;

  const wp_url = process.env.GF_WP_URL || existing?.wp_url || "https://caftanfactory.com";
  const ck = process.env.GF_CK || "";
  const cs = process.env.GF_CS || "";
  const form_id = Number(process.env.GF_FORM_ID || existing?.form_id || 4);
  if (!ck || !cs) {
    console.error("Aucun credential trouvé. Configure GF_CK/GF_CS dans .env.local OU via /admin/integrations/gravity-forms.");
    process.exit(1);
  }
  console.log("→ Bootstrap des settings GF depuis .env.local…");
  await supabase
    .from("gf_settings")
    .update({ wp_url, ck, cs, form_id, enabled: true })
    .eq("id", 1);
  const { data } = await supabase.from("gf_settings").select("*").eq("id", 1).single();
  return data;
}

const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const CV_KEYS = ["7", "9", "15", "16", "17", "18", "cv", "cv_url", "cv_link", "CV"];

function getField(e, key) {
  if (!key) return "";
  const v = e[key];
  return v == null ? "" : String(v).trim();
}

function findCv(e) {
  for (const k of CV_KEYS) {
    const v = e[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v) && v.length > 10) return v;
  }
  return null;
}

function parseDays(e, prefix) {
  if (!prefix) return "";
  const labels = [];
  for (let i = 1; i <= 7; i++) if (e[`${prefix}.${i}`]) labels.push(DAY_LABELS[i - 1]);
  return labels.join(", ");
}

function mapEntry(e, fm) {
  const firstname = getField(e, fm.firstname);
  const lastname = getField(e, fm.lastname);
  const email = getField(e, fm.email).toLowerCase();
  const fullName = `${firstname} ${lastname}`.trim();
  if (!email || !fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const birthRaw = getField(e, fm.birthdate);
  const birthDate = /^\d{4}-\d{2}-\d{2}/.test(birthRaw) ? birthRaw.slice(0, 10) : null;
  const cityRaw = getField(e, fm.city);
  const city = cityRaw.includes("|") ? cityRaw.split("|")[0].trim() : cityRaw || null;
  const dispo = parseDays(e, fm.days_prefix);
  const role = getField(e, fm.role);
  const worktime = getField(e, fm.worktime);
  const availableFrom = getField(e, fm.available_from);
  const motivation = [
    role && `Poste demandé : ${role}`,
    worktime && `Disponibilité : ${worktime}`,
    dispo && `Jours dispo : ${dispo}`,
    availableFrom && `Date dispo : ${availableFrom}`,
  ].filter(Boolean).join("\n") || null;

  return {
    gf_entry_id: String(e.id),
    email,
    full_name: fullName,
    phone: getField(e, fm.phone) || null,
    birth_date: birthDate,
    city,
    source: "gravity_forms",
    motivation,
    cv_url: findCv(e),
    raw_payload: {
      gf_id: e.id, form_id: e.form_id, date_created: e.date_created,
      ip: e.ip, source_url: e.source_url, user_agent: e.user_agent,
    },
  };
}

async function fetchAll(settings) {
  const auth = Buffer.from(`${settings.ck}:${settings.cs}`).toString("base64");
  const all = [];
  let page = 1;
  while (true) {
    const url = `${settings.wp_url.replace(/\/$/, "")}/wp-json/gf/v2/entries?form_ids[]=${settings.form_id}&paging[page_size]=200&paging[current_page]=${page}`;
    const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status} - ${await r.text()}`);
    const j = await r.json();
    const entries = j.entries || [];
    all.push(...entries);
    if (entries.length < 200) break;
    page++;
    if (page > 50) break;
  }
  return all;
}

async function main() {
  const settings = await ensureSettings();
  console.log(`→ Fetch GF: ${settings.wp_url} (form ${settings.form_id})…`);
  const entries = await fetchAll(settings);
  console.log(`  ${entries.length} entrées récupérées.`);

  const mapped = [];
  let invalid = 0;
  for (const e of entries) {
    const m = mapEntry(e, settings.field_map);
    if (m) mapped.push(m); else invalid += 1;
  }
  console.log(`  ${mapped.length} valides, ${invalid} ignorées.`);

  if (mapped.length === 0) { console.log("Rien à importer."); return; }

  const ids = mapped.map((m) => m.gf_entry_id);
  const { data: existing } = await supabase.from("candidates").select("gf_entry_id").in("gf_entry_id", ids);
  const seen = new Set((existing ?? []).map((r) => r.gf_entry_id));
  const toCreate = mapped.filter((m) => !seen.has(m.gf_entry_id));
  console.log(`  ${toCreate.length} nouveaux, ${mapped.length - toCreate.length} déjà connus.`);

  if (toCreate.length === 0) { console.log("Rien de nouveau."); return; }

  const candRows = toCreate.map((m) => ({
    email: m.email, full_name: m.full_name, phone: m.phone,
    birth_date: m.birth_date, city: m.city, source: m.source,
    gf_entry_id: m.gf_entry_id, raw_payload: m.raw_payload,
    applied_at: m.raw_payload?.date_created ?? null,
  }));
  const { data: created, error } = await supabase.from("candidates").insert(candRows).select("id, gf_entry_id");
  if (error) { console.error("Erreur insert candidates:", error.message); process.exit(1); }
  console.log(`  ✓ ${created.length} candidats créés.`);

  const appRows = created.map((c) => {
    const m = toCreate.find((x) => x.gf_entry_id === c.gf_entry_id);
    return { candidate_id: c.id, job_id: null, status: "new", motivation: m?.motivation ?? null };
  });
  const { error: appErr } = await supabase.from("applications").insert(appRows);
  if (appErr) console.error("Erreur applications:", appErr.message);
  else console.log(`  ✓ ${appRows.length} applications créées.`);

  await supabase
    .from("gf_settings")
    .update({ last_synced_at: new Date().toISOString(), last_sync_count: created.length })
    .eq("id", 1);

  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
