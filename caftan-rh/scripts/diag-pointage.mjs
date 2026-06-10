#!/usr/bin/env node
// Diagnostic LECTURE SEULE du sous-systeme pointage (Karim 2026-06-10).
// N'ecrit rien. Sort des agregats non sensibles pour comprendre pourquoi
// le pointage "echappe au controle" :
//   - etat des reglages org_settings (mode geofence strict, selfie)
//   - sites sans coordonnees GPS (geofence inoperante)
//   - taux d'anomalies / pointages sans geoloc / sans selfie sur 14j
//
// Usage : node scripts/diag-pointage.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

function line() { console.log("-".repeat(64)); }

// 1) org_settings -------------------------------------------------------
line();
console.log("1) REGLAGES (org_settings id=1)");
const { data: org, error: orgErr } = await sb
  .from("org_settings")
  .select("clock_geofence_strict, clock_require_selfie, clock_selfie_keep_days")
  .eq("id", 1)
  .maybeSingle();
if (orgErr) console.log("  ERREUR:", orgErr.message);
else if (!org) console.log("  (aucune ligne org_settings id=1 -> defauts code appliques : strict=true, selfie=true, 30j)");
else {
  const strict = org.clock_geofence_strict !== false;
  console.log(`  clock_geofence_strict : ${org.clock_geofence_strict}  => geofence ${strict ? "BLOQUANTE" : "EN AUDIT SEUL (ne bloque pas !)"}`);
  console.log(`  clock_require_selfie  : ${org.clock_require_selfie}`);
  console.log(`  clock_selfie_keep_days: ${org.clock_selfie_keep_days ?? "(null -> 30)"}`);
}

// 2) sites --------------------------------------------------------------
line();
console.log("2) SITES (coordonnees GPS + rayon)");
const { data: sites, error: sitesErr } = await sb
  .from("sites")
  .select("id, code, name, lat, lng, geofence_radius_m")
  .order("code");
if (sitesErr) console.log("  ERREUR:", sitesErr.message);
else {
  for (const s of sites ?? []) {
    const hasGeo = s.lat != null && s.lng != null;
    console.log(`  ${(s.code ?? "?").padEnd(12)} ${hasGeo ? "GPS ok" : "!! SANS GPS (geofence inoperante)"}  rayon=${s.geofence_radius_m ?? "(null->100)"}m  ${s.name ?? ""}`);
  }
  const noGeo = (sites ?? []).filter((s) => s.lat == null || s.lng == null);
  console.log(`  -> ${noGeo.length}/${(sites ?? []).length} site(s) sans coordonnees GPS`);
}

// 3) clock_entries 14j --------------------------------------------------
line();
console.log("3) POINTAGES (14 derniers jours)");
const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
const { data: entries, error: entErr } = await sb
  .from("clock_entries")
  .select("id, kind, occurred_at, site_id, entry_method, source, geo_lat, geo_lng, is_anomalous, selfie_storage_path, selfie_purge_after")
  .gte("occurred_at", since)
  .limit(5000);
if (entErr) console.log("  ERREUR:", entErr.message);
else {
  const e = entries ?? [];
  const ins = e.filter((x) => x.kind === "in");
  const anomalous = e.filter((x) => x.is_anomalous);
  const noGeoIn = ins.filter((x) => x.geo_lat == null || x.geo_lng == null);
  const noSelfieIn = ins.filter((x) => !x.selfie_storage_path);
  const bySource = {};
  for (const x of e) bySource[x.source ?? "?"] = (bySource[x.source ?? "?"] ?? 0) + 1;
  const byMethod = {};
  for (const x of e) byMethod[x.entry_method ?? "?"] = (byMethod[x.entry_method ?? "?"] ?? 0) + 1;
  console.log(`  total entrees   : ${e.length}  (dont ${ins.length} clock-in)`);
  console.log(`  is_anomalous    : ${anomalous.length}  (${ins.length ? Math.round((anomalous.length / e.length) * 100) : 0}%)`);
  console.log(`  clock-in SANS geoloc : ${noGeoIn.length}/${ins.length}`);
  console.log(`  clock-in SANS selfie : ${noSelfieIn.length}/${ins.length}`);
  console.log(`  par source  :`, JSON.stringify(bySource));
  console.log(`  par methode :`, JSON.stringify(byMethod));
}

// 4) selfies en retard de purge ----------------------------------------
line();
console.log("4) PURGE RGPD selfies");
const { count: toPurge, error: purgeErr } = await sb
  .from("clock_entries")
  .select("id", { count: "exact", head: true })
  .lt("selfie_purge_after", new Date().toISOString())
  .not("selfie_storage_path", "is", null);
if (purgeErr) console.log("  ERREUR:", purgeErr.message);
else console.log(`  selfies dus a la purge (purge_after depasse, fichier encore present) : ${toPurge ?? 0}`);

line();
console.log("Diagnostic termine (aucune ecriture effectuee).");
