#!/usr/bin/env node
// Seed des jours fériés religieux + internationaux 2026-2028.
// Idempotent : ON CONFLICT DO NOTHING via lookup préalable.
//
// Source des dates islamiques : prédictions Umm al-Qura. À valider auprès de
// l'Exécutif des Musulmans de Belgique avant chaque échéance.

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

// Dupliqué côté Node depuis `caftan-rh/src/lib/holidays/intl.ts` pour rester
// sans build step. Mettre à jour les deux ensemble.
const INTL = [
  // ── ISLAMIC 2026 ──
  { date: "2026-02-17", label: "Début Ramadan 1447",            kind: "religious",     tradition: "islamic", priority: 3 },
  { date: "2026-03-19", label: "Aïd al-Fitr 1447",              kind: "religious",     tradition: "islamic", priority: 3 },
  { date: "2026-03-20", label: "Aïd al-Fitr 1447 — j+1",        kind: "religious",     tradition: "islamic", priority: 2 },
  { date: "2026-05-26", label: "Aïd al-Adha 1447",              kind: "religious",     tradition: "islamic", priority: 3 },
  { date: "2026-05-27", label: "Aïd al-Adha 1447 — j+1",        kind: "religious",     tradition: "islamic", priority: 2 },
  { date: "2026-06-14", label: "Nouvel an hégirien 1448",       kind: "religious",     tradition: "islamic", priority: 1 },
  { date: "2026-06-23", label: "Achoura 1448",                  kind: "religious",     tradition: "islamic", priority: 1 },
  { date: "2026-08-24", label: "Mawlid 1448",                   kind: "religious",     tradition: "islamic", priority: 2 },
  // ── ISLAMIC 2027 ──
  { date: "2027-02-07", label: "Début Ramadan 1448",            kind: "religious",     tradition: "islamic", priority: 3 },
  { date: "2027-03-09", label: "Aïd al-Fitr 1448",              kind: "religious",     tradition: "islamic", priority: 3 },
  { date: "2027-03-10", label: "Aïd al-Fitr 1448 — j+1",        kind: "religious",     tradition: "islamic", priority: 2 },
  { date: "2027-05-15", label: "Aïd al-Adha 1448",              kind: "religious",     tradition: "islamic", priority: 3 },
  { date: "2027-05-16", label: "Aïd al-Adha 1448 — j+1",        kind: "religious",     tradition: "islamic", priority: 2 },
  { date: "2027-06-03", label: "Nouvel an hégirien 1449",       kind: "religious",     tradition: "islamic", priority: 1 },
  { date: "2027-06-12", label: "Achoura 1449",                  kind: "religious",     tradition: "islamic", priority: 1 },
  { date: "2027-08-13", label: "Mawlid 1449",                   kind: "religious",     tradition: "islamic", priority: 2 },
  // ── ISLAMIC 2028 ──
  { date: "2028-01-27", label: "Début Ramadan 1449",            kind: "religious",     tradition: "islamic", priority: 3 },
  { date: "2028-02-25", label: "Aïd al-Fitr 1449",              kind: "religious",     tradition: "islamic", priority: 3 },
  { date: "2028-05-03", label: "Aïd al-Adha 1449",              kind: "religious",     tradition: "islamic", priority: 3 },
  // ── INTERNATIONAL CIVIL ──
  { date: "2026-03-08", label: "Journée internationale des droits des femmes", kind: "international", tradition: "secular", priority: 1 },
  { date: "2027-03-08", label: "Journée internationale des droits des femmes", kind: "international", tradition: "secular", priority: 1 },
  { date: "2028-03-08", label: "Journée internationale des droits des femmes", kind: "international", tradition: "secular", priority: 1 },
  // ── AUTRES TRADITIONS ──
  { date: "2026-02-17", label: "Nouvel an chinois (Cheval de feu)", kind: "international", tradition: "secular",   priority: 0 },
  { date: "2027-02-06", label: "Nouvel an chinois (Chèvre)",        kind: "international", tradition: "secular",   priority: 0 },
  { date: "2026-12-04", label: "Hanoukka — 1er jour",               kind: "religious",     tradition: "jewish",    priority: 0 },
  { date: "2026-09-12", label: "Roch Hachana 5787",                 kind: "religious",     tradition: "jewish",    priority: 0 },
  { date: "2026-09-21", label: "Yom Kippour 5787",                  kind: "religious",     tradition: "jewish",    priority: 0 },
  { date: "2026-11-08", label: "Diwali",                            kind: "religious",     tradition: "hindu",     priority: 0 },
  { date: "2027-10-28", label: "Diwali",                            kind: "religious",     tradition: "hindu",     priority: 0 },
  { date: "2026-01-07", label: "Noël orthodoxe",                    kind: "religious",     tradition: "christian", priority: 0 },
  { date: "2027-01-07", label: "Noël orthodoxe",                    kind: "religious",     tradition: "christian", priority: 0 },
];

async function main() {
  let inserted = 0, skipped = 0, failed = 0;
  for (const h of INTL) {
    const { data: existing } = await supabase
      .from("holidays")
      .select("id, kind, priority, tradition")
      .eq("date", h.date)
      .eq("label", h.label)
      .maybeSingle();

    if (existing) {
      // Mise à niveau (priority/tradition/kind) si l'enregistrement n'a pas
      // encore été classifié.
      if (
        existing.kind !== h.kind ||
        existing.priority !== h.priority ||
        existing.tradition !== h.tradition
      ) {
        const { error } = await supabase
          .from("holidays")
          .update({ kind: h.kind, priority: h.priority, tradition: h.tradition })
          .eq("id", existing.id);
        if (error) {
          console.error(`  ✗ MAJ ${h.date} ${h.label} : ${error.message}`);
          failed++;
        } else {
          console.log(`  ↻ MAJ ${h.date} ${h.label}`);
        }
      } else {
        skipped++;
      }
      continue;
    }

    const { error } = await supabase.from("holidays").insert({
      date: h.date,
      label: h.label,
      kind: h.kind,
      tradition: h.tradition,
      priority: h.priority,
      country: null,
      recurring_yearly: false,
      is_active: true,
    });
    if (error) {
      console.error(`  ✗ ${h.date} ${h.label} : ${error.message}`);
      failed++;
      continue;
    }
    inserted++;
    console.log(`  ✓ ${h.date} ${h.label} [${h.kind}/${h.tradition}/p${h.priority}]`);
  }
  console.log(
    `\nDone. ${inserted} insérés, ${skipped} déjà à jour, ${failed} échecs.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
