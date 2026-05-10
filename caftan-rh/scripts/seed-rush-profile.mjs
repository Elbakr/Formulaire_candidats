#!/usr/bin/env node
// Seed du profil de rush horaire par défaut (site_id=NULL, day_of_week=NULL).
// Repris de planning-employes.html getRushProfile() — courbe standard hiver
// jour normal sans multiplicateurs spéciaux. Les multiplicateurs Sam/fériés/
// période forte / vacances sont stockés dans org_settings.rush_*_multiplier
// et appliqués dynamiquement par le solver.
//
// Idempotent : on supprime puis ré-insère le profil DEFAULT (site_id IS NULL,
// day_of_week IS NULL) pour pouvoir relancer après un tweak des coefficients.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Profil de rush par défaut (site_id=NULL, day_of_week=NULL).
// Repris de planning-employes.html getRushProfile() — courbe standard hiver.
//
// Lecture : pour chaque créneau, le solver multiplie la durée par le weight ;
// plus le score total est élevé, plus le créneau est "pic" → priorité aux
// employés expérimentés (seniorTier ∈ {senior, lead}).
const DEFAULT_SEGMENTS = [
  { start_minute: 10 * 60, end_minute: 12 * 60, weight: 0.4, label: "creux matin" },
  { start_minute: 12 * 60, end_minute: 13 * 60, weight: 0.8, label: "pré-montée" },
  { start_minute: 13 * 60, end_minute: 15 * 60, weight: 1.5, label: "montée critique" },
  { start_minute: 15 * 60, end_minute: 17 * 60, weight: 3.0, label: "PIC ABSOLU" },
  { start_minute: 17 * 60, end_minute: 18 * 60, weight: 2.0, label: "descente haute" },
  { start_minute: 18 * 60, end_minute: 19 * 60, weight: 1.0, label: "descente normale" },
  { start_minute: 19 * 60, end_minute: 20 * 60, weight: 0.5, label: "fermeture" },
];

async function main() {
  console.log("→ Reset du profil de rush DEFAULT (site_id=NULL, day_of_week=NULL)…");

  const { error: delErr } = await supabase
    .from("rush_profile_segments")
    .delete()
    .is("site_id", null)
    .is("day_of_week", null);

  if (delErr) {
    console.error("  ✗ delete failed:", delErr.message);
    process.exit(1);
  }

  console.log(`→ Insertion de ${DEFAULT_SEGMENTS.length} segments…`);
  const rows = DEFAULT_SEGMENTS.map((s) => ({
    site_id: null,
    day_of_week: null,
    start_minute: s.start_minute,
    end_minute: s.end_minute,
    weight: s.weight,
    label: s.label,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from("rush_profile_segments")
    .insert(rows)
    .select("id, label, weight");
  if (error) {
    console.error("  ✗ insert failed:", error.message);
    process.exit(1);
  }

  for (const r of data ?? []) {
    console.log(`  ✓ ${r.label} ×${r.weight}`);
  }
  console.log(`\nDone. ${data?.length ?? 0} segments insérés.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
