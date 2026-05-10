#!/usr/bin/env node
// Seed des 6 sites Caftan Factory + créneaux d'effectif requis hebdomadaires.
// Repris fidèlement de planning-employes.html (SITES + STORE_NEEDS).
// Idempotent : upsert par code site puis remplace les besoins du site.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SITES = [
  { code: "A", name: "A Brabant",  abbr: "A", city: "Bruxelles", address: "Rue de Brabant 230, 1030 Schaerbeek",   color: "#2d5be3", light_color: "#eef1fd", sort_order: 1 },
  { code: "B", name: "B Ransfort", abbr: "B", city: "Bruxelles", address: "Rue Ransfort 67, 1080 Molenbeek",        color: "#16a34a", light_color: "#dcfce7", sort_order: 2 },
  { code: "C", name: "C Antw",     abbr: "C", city: "Anvers",    address: "Lange Kievitstraat 64, 2018 Antwerpen",  color: "#7c3aed", light_color: "#f3e8ff", sort_order: 3 },
  { code: "D", name: "D Brabant",  abbr: "D", city: "Bruxelles", address: "Entrepôt Bruxelles",                     color: "#ea580c", light_color: "#ffedd5", sort_order: 4 },
  { code: "E", name: "E Molenb",   abbr: "E", city: "Bruxelles", address: "Online / Télétravail",                   color: "#0891b2", light_color: "#cffafe", sort_order: 5 },
  { code: "F", name: "F Antw",     abbr: "F", city: "Anvers",    address: "Anvers (2e site) / Événements",          color: "#be185d", light_color: "#fce7f3", sort_order: 6 },
];

// 0=Dim, 1=Lun, 2=Mar, 3=Mer, 4=Jeu, 5=Ven, 6=Sam
const NEEDS = {
  A: {
    0: [{ debut: "10:00", fin: "20:00", v: 2 }, { debut: "12:30", fin: "20:00", v: 1 }],
    1: [{ debut: "10:00", fin: "20:00", v: 2 }, { debut: "13:00", fin: "20:00", v: 1 }],
    2: [{ debut: "10:00", fin: "20:00", v: 2 }],
    3: [{ debut: "10:00", fin: "20:00", v: 2 }],
    4: [{ debut: "10:00", fin: "20:00", v: 2 }],
    5: [{ debut: "10:00", fin: "13:55", v: 2, am: true }, { debut: "14:45", fin: "20:00", v: 3, pm: true }],
    6: [{ debut: "10:00", fin: "20:00", v: 2 }, { debut: "13:00", fin: "20:00", v: 1 }],
  },
  B: {
    0: [{ debut: "10:00", fin: "20:00", v: 2 }],
    1: [{ debut: "10:30", fin: "19:30", v: 2 }],
    2: [{ debut: "10:30", fin: "19:30", v: 2 }],
    3: [{ debut: "10:30", fin: "19:30", v: 2 }],
    4: [{ debut: "10:30", fin: "19:30", v: 2 }],
    5: [{ debut: "10:30", fin: "13:55", v: 2, am: true }, { debut: "14:45", fin: "19:30", v: 2, pm: true }],
    6: [{ debut: "10:00", fin: "20:00", v: 2 }, { debut: "13:00", fin: "20:00", v: 1 }],
  },
  C: {
    0: [{ debut: "10:00", fin: "19:00", v: 1 }],
    1: [{ debut: "10:00", fin: "19:00", v: 1 }],
    2: [{ debut: "10:00", fin: "19:00", v: 1 }],
    3: [{ debut: "10:00", fin: "19:00", v: 1 }],
    4: [{ debut: "10:00", fin: "19:00", v: 1 }],
    5: [{ debut: "10:00", fin: "13:55", v: 1, am: true }, { debut: "14:45", fin: "19:00", v: 1, pm: true }],
    6: [{ debut: "10:00", fin: "19:00", v: 2 }],
  },
  D: {
    0: [{ debut: "10:00", fin: "20:00", v: 1, role: "Logistique" }],
    1: [{ debut: "10:30", fin: "19:30", v: 1, role: "Logistique" }],
    2: [{ debut: "10:30", fin: "19:30", v: 1, role: "Logistique" }],
    3: [{ debut: "10:30", fin: "19:30", v: 1, role: "Logistique" }],
    4: [{ debut: "10:30", fin: "19:30", v: 1, role: "Logistique" }],
    5: [{ debut: "10:30", fin: "13:55", v: 1, am: true }, { debut: "14:45", fin: "19:30", v: 1, pm: true }],
    6: [{ debut: "10:00", fin: "20:00", v: 1, role: "Logistique" }],
  },
  E: {
    0: [{ debut: "10:00", fin: "20:00", v: 1, role: "Online" }],
    1: [{ debut: "10:00", fin: "19:30", v: 1, role: "Online" }],
    2: [{ debut: "10:00", fin: "19:30", v: 1, role: "Online" }],
    3: [{ debut: "10:00", fin: "19:30", v: 1, role: "Online" }],
    4: [{ debut: "10:00", fin: "19:30", v: 1, role: "Online" }],
    5: [{ debut: "10:00", fin: "13:55", v: 1, am: true }, { debut: "14:45", fin: "19:30", v: 1, pm: true }],
    6: [{ debut: "10:00", fin: "20:00", v: 1, role: "Online" }],
  },
  F: {
    0: [{ debut: "10:30", fin: "18:45", v: 1 }],
    1: [{ debut: "10:30", fin: "18:45", v: 1 }],
    2: [{ debut: "10:30", fin: "18:45", v: 1 }],
    3: [{ debut: "10:30", fin: "18:45", v: 1 }],
    4: [{ debut: "10:30", fin: "18:45", v: 1 }],
    5: [{ debut: "10:30", fin: "13:55", v: 1, am: true }, { debut: "14:45", fin: "18:45", v: 1, pm: true }],
    6: [{ debut: "10:30", fin: "18:45", v: 2 }],
  },
};

async function upsertSite(s) {
  const { data: existing } = await supabase
    .from("sites")
    .select("id")
    .eq("code", s.code)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("sites")
      .update(s)
      .eq("id", existing.id);
    if (error) throw error;
    return { id: existing.id, created: false };
  }
  const { data, error } = await supabase
    .from("sites")
    .insert(s)
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
}

async function replaceNeedsForSite(siteId, code) {
  const grid = NEEDS[code];
  if (!grid) return 0;
  // Wipe existing needs for this site, re-insert.
  await supabase.from("site_needs").delete().eq("site_id", siteId);

  const rows = [];
  for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
    const slots = grid[dow] || [];
    for (const sl of slots) {
      rows.push({
        site_id: siteId,
        day_of_week: dow,
        start_time: sl.debut,
        end_time: sl.fin,
        headcount: sl.v,
        role: sl.role ?? "Vendeur(se)",
        is_friday_morning: !!sl.am,
        is_friday_afternoon: !!sl.pm,
      });
    }
  }
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("site_needs").insert(rows);
  if (error) throw error;
  return rows.length;
}

async function main() {
  let sitesIns = 0, sitesUpd = 0, needsTotal = 0;
  for (const s of SITES) {
    const { id, created } = await upsertSite(s);
    if (created) sitesIns++; else sitesUpd++;
    const n = await replaceNeedsForSite(id, s.code);
    console.log(`  ${created ? "+" : "↻"} ${s.code} ${s.name} (${n} créneaux)`);
    needsTotal += n;
  }
  console.log(
    `\nDone. ${sitesIns} site(s) créé(s), ${sitesUpd} mis à jour. ${needsTotal} créneaux d'effectif insérés.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
