#!/usr/bin/env node
// Backfill : re-fetch les 1809 entrées Gravity Forms, sauvegarde le CV URL,
// le payload complet (motivation, jours dispo, role, etc.) et crée des
// documents rows pour les CVs.

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

const CV_KEYS = ["7", "9", "15", "16", "17", "18", "cv", "cv_url", "cv_link", "CV"];

function findCv(entry) {
  for (const k of CV_KEYS) {
    const v = entry[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v) && v.length > 10) return v;
  }
  return null;
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

console.log("→ Fetching Gravity Forms settings…");
const { data: settings } = await supabase.from("gf_settings").select("*").eq("id", 1).single();
if (!settings?.ck || !settings?.cs) {
  console.error("gf_settings incomplet — utilise admin/integrations/gravity-forms");
  process.exit(1);
}

console.log("→ Re-fetch des entrées GF…");
const entries = await fetchAll(settings);
console.log(`  ${entries.length} entrées récupérées de ${settings.wp_url}`);

// Index existing candidates by gf_entry_id (override Supabase 1000-row default)
const { data: existingCands } = await supabase
  .from("candidates")
  .select("id, gf_entry_id, full_name, cv_url, gf_full_payload")
  .not("gf_entry_id", "is", null)
  .range(0, 9999);
const byGfId = new Map((existingCands ?? []).map(c => [c.gf_entry_id, c]));
console.log(`  ${byGfId.size} candidats GF déjà en base`);

let updatedCands = 0;
let createdDocs = 0;
let skippedDocs = 0;
let cvFound = 0;
let noCv = 0;

for (let i = 0; i < entries.length; i++) {
  const e = entries[i];
  const gfId = String(e.id);
  const cand = byGfId.get(gfId);
  if (!cand) continue; // candidat absent en base, skip (rare)

  const cvUrl = findCv(e);
  if (cvUrl) cvFound++;
  else noCv++;

  // Met à jour cv_url + gf_full_payload
  const needsUpdate =
    (cvUrl && cand.cv_url !== cvUrl) ||
    !cand.gf_full_payload ||
    Object.keys(cand.gf_full_payload || {}).length < 5;

  if (needsUpdate) {
    await supabase.from("candidates").update({
      cv_url: cvUrl,
      gf_full_payload: e,
    }).eq("id", cand.id);
    updatedCands++;
  }

  // Crée un documents row pour le CV s'il n'existe pas déjà
  if (cvUrl) {
    const { data: existingDoc } = await supabase
      .from("documents")
      .select("id")
      .eq("candidate_id", cand.id)
      .eq("kind", "cv")
      .maybeSingle();

    if (!existingDoc) {
      // Trouver l'application liée
      const { data: app } = await supabase
        .from("applications")
        .select("id")
        .eq("candidate_id", cand.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const filename = `CV - ${cand.full_name}.${cvUrl.split(".").pop()?.split("?")[0] || "pdf"}`;
      const { error: docErr } = await supabase.from("documents").insert({
        application_id: app?.id ?? null,
        candidate_id: cand.id,
        kind: "cv",
        catalog_slug: "cv",
        storage_path: cvUrl, // URL externe — le UI traitera les http(s) comme externes
        file_name: filename,
        mime_type: cvUrl.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
        validation_status: "pending",
      });
      if (!docErr) createdDocs++;
    } else {
      skippedDocs++;
    }
  }

  if ((i + 1) % 200 === 0) console.log(`  ... ${i + 1}/${entries.length}`);
}

console.log("\nDone.");
console.log(`  ${updatedCands} candidats mis à jour avec cv_url + gf_full_payload`);
console.log(`  ${cvFound} CV URLs trouvés / ${noCv} candidats sans CV`);
console.log(`  ${createdDocs} documents créés / ${skippedDocs} CVs déjà documentés`);
