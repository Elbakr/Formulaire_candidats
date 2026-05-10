#!/usr/bin/env node
// Seed des jours fériés légaux belges pour l'année courante + N+1.
// Idempotent : on insert ON CONFLICT DO NOTHING sur (date, label, country).
//
// Bonus : seed les vacances scolaires Belgique (Communauté française / Bruxelles)
// 2026-2027 si les dates sont fournies en dur. Ces dates sont indicatives —
// l'admin peut les modifier via /admin/holidays.

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

// ─── Calculs purs Pâques + jours fériés BE ─────────────────────────────────
// (Réplique de `caftan-rh/src/lib/holidays/be.ts` côté Node — on évite l'import
//  du TS pour rester sans build step.)

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUTC(d, n) {
  return new Date(d.getTime() + n * 86_400_000);
}

function toISO(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function belgianHolidaysFor(year) {
  const easter = easterSunday(year);
  const fixed = (m, d) => toISO(new Date(Date.UTC(year, m - 1, d)));
  return [
    { date: fixed(1, 1),                       label: "Nouvel An" },
    { date: toISO(addDaysUTC(easter, 1)),      label: "Lundi de Pâques" },
    { date: fixed(5, 1),                       label: "Fête du Travail" },
    { date: toISO(addDaysUTC(easter, 39)),     label: "Ascension" },
    { date: toISO(addDaysUTC(easter, 50)),     label: "Lundi de Pentecôte" },
    { date: fixed(7, 21),                      label: "Fête nationale belge" },
    { date: fixed(8, 15),                      label: "Assomption" },
    { date: fixed(11, 1),                      label: "Toussaint" },
    { date: fixed(11, 11),                     label: "Armistice 1918" },
    { date: fixed(12, 25),                     label: "Noël" },
  ];
}

// ─── Vacances scolaires Belgique francophone — indicatif ────────────────────
// Source : calendrier officiel Communauté française. Les dates 2027 sont
// déduites du même schéma (à valider lorsque l'arrêté officiel sortira).
const SCHOOL_BREAKS_BE_BRU = [
  { label: "Congé d'automne (Toussaint) 2026",   start_date: "2026-10-26", end_date: "2026-11-01" },
  { label: "Vacances d'hiver (Noël) 2026-2027",  start_date: "2026-12-21", end_date: "2027-01-04" },
  { label: "Congé de détente (Carnaval) 2027",   start_date: "2027-02-15", end_date: "2027-02-21" },
  { label: "Vacances de printemps 2027",         start_date: "2027-05-03", end_date: "2027-05-16" },
  { label: "Vacances d'été 2027",                start_date: "2027-07-05", end_date: "2027-08-22" },
  { label: "Congé d'automne (Toussaint) 2027",   start_date: "2027-10-25", end_date: "2027-10-31" },
];

// ─── Seed ───────────────────────────────────────────────────────────────────

async function seedHolidaysForYear(year) {
  const list = belgianHolidaysFor(year);
  let inserted = 0;
  let skipped = 0;
  for (const h of list) {
    // Lookup existant — la contrainte unique est (date, label, country)
    const { data: existing } = await supabase
      .from("holidays")
      .select("id")
      .eq("date", h.date)
      .eq("label", h.label)
      .eq("country", "BE")
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    const { error } = await supabase.from("holidays").insert({
      date: h.date,
      label: h.label,
      kind: "legal",
      country: "BE",
      recurring_yearly: true,
      is_active: true,
    });
    if (error) {
      console.error(`  ✗ ${h.date} ${h.label} : ${error.message}`);
      continue;
    }
    inserted += 1;
    console.log(`  ✓ ${h.date} ${h.label}`);
  }
  return { inserted, skipped };
}

async function seedSchoolBreaks() {
  let inserted = 0;
  let skipped = 0;
  for (const b of SCHOOL_BREAKS_BE_BRU) {
    const { data: existing } = await supabase
      .from("school_breaks")
      .select("id")
      .eq("label", b.label)
      .eq("start_date", b.start_date)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    const { error } = await supabase.from("school_breaks").insert({
      label: b.label,
      start_date: b.start_date,
      end_date: b.end_date,
      region: "BE-BRU",
    });
    if (error) {
      console.error(`  ✗ ${b.label} : ${error.message}`);
      continue;
    }
    inserted += 1;
    console.log(`  ✓ ${b.start_date} → ${b.end_date} ${b.label}`);
  }
  return { inserted, skipped };
}

async function main() {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const nextYear = currentYear + 1;

  console.log(`→ Jours fériés légaux Belgique — ${currentYear}`);
  const r1 = await seedHolidaysForYear(currentYear);
  console.log(`→ Jours fériés légaux Belgique — ${nextYear}`);
  const r2 = await seedHolidaysForYear(nextYear);

  const totalInserted = r1.inserted + r2.inserted;
  const totalSkipped = r1.skipped + r2.skipped;

  console.log(`\n→ Vacances scolaires Belgique francophone (BE-BRU) — indicatif`);
  const r3 = await seedSchoolBreaks();

  console.log(
    `\nDone.\n  Fériés : ${totalInserted} insérés, ${totalSkipped} déjà présents.\n  Vacances scolaires : ${r3.inserted} insérés, ${r3.skipped} déjà présents.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
