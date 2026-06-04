#!/usr/bin/env node
// Karim 2026-06-04 : applique la migration 20260620000830 directement via
// Supabase admin (REPLACE des ☒/☐). Audit before/after pour verifier que
// la bascule a bien eu lieu.

import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const REPLACEMENTS = {
  employee: [
    ["- ☒ À **{{weekly_hours}} heures par semaine** et est repartie comme suit*",
     "- ☐ À **{{weekly_hours}} heures par semaine** et est repartie comme suit*"],
    ["- ☐ À {{weekly_hours}} heures en moyenne par semaine et est établie conformément au système de l'horaire flottant",
     "- ☒ À {{weekly_hours}} heures en moyenne par semaine et est établie conformément au système de l'horaire flottant"],
  ],
  employee_pt: [
    ["- ☒ à **{{weekly_hours}}h par semaine** suivant l'**horaire fixe**",
     "- ☐ à **{{weekly_hours}}h par semaine** suivant l'**horaire fixe**"],
    ["- ☐ à {{weekly_hours}}h par semaine* ou à {{weekly_hours}}h sur un cycle",
     "- ☒ à {{weekly_hours}}h par semaine* ou à {{weekly_hours}}h sur un cycle"],
  ],
  student: [
    ["- ☒ À **{{weekly_hours}} heures par semaine** et est repartie comme suit*",
     "- ☐ À **{{weekly_hours}} heures par semaine** et est repartie comme suit*"],
    ["- ☐ à {{weekly_hours}}h par semaine* suivant un horaire variable",
     "- ☒ à {{weekly_hours}}h par semaine* suivant un horaire variable"],
  ],
};

for (const [code, swaps] of Object.entries(REPLACEMENTS)) {
  const { data: row } = await sb.from("contract_templates").select("code, body_markdown").eq("code", code).maybeSingle();
  if (!row) { console.error(`Template ${code} introuvable`); continue; }
  let body = row.body_markdown;
  const before = body;
  let appliedSwaps = 0;
  for (const [from, to] of swaps) {
    if (body.includes(from)) {
      body = body.replace(from, to);
      appliedSwaps += 1;
    } else {
      console.warn(`  ⚠ ${code} : pattern non trouvé (deja modifie ou edit admin) : "${from.slice(0, 60)}…"`);
    }
  }
  if (body === before) {
    console.log(`  ${code} : aucun changement (${appliedSwaps}/${swaps.length} swaps appliques)`);
    continue;
  }
  const { error } = await sb.from("contract_templates").update({ body_markdown: body }).eq("code", code);
  if (error) console.error(`  ❌ ${code} : ${error.message}`);
  else console.log(`  ✓ ${code} : ${appliedSwaps}/${swaps.length} swaps appliques en BD`);
}

console.log("\nDone.");
