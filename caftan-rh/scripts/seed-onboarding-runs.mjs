#!/usr/bin/env node
// Pour chaque employé existant qui n'a PAS encore de onboarding_run, en crée un
// à partir du template par défaut. Usage : `npm run seed:onboarding`.

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

async function main() {
  // Récupère le template par défaut + ses items
  const { data: tpl, error: tplErr } = await supabase
    .from("onboarding_templates")
    .select("id, name")
    .eq("is_default", true)
    .maybeSingle();
  if (tplErr) throw tplErr;
  if (!tpl) {
    console.error("Aucun template par défaut trouvé. Exécute d'abord la migration onboarding.");
    process.exit(1);
  }
  console.log(`→ Template par défaut : ${tpl.name} (${tpl.id})`);

  const { data: tplItems, error: tplItemsErr } = await supabase
    .from("onboarding_template_items")
    .select("id, label, description, category, is_required, responsible_role, position")
    .eq("template_id", tpl.id)
    .order("position");
  if (tplItemsErr) throw tplItemsErr;
  console.log(`  ${tplItems?.length ?? 0} items dans le template.`);

  // Liste les employés sans run
  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("id, full_name, status")
    .order("full_name");
  if (empErr) throw empErr;

  const empList = (employees ?? []).filter((e) => e.status === "active");
  console.log(`\n→ ${empList.length} employés actifs à examiner.`);

  let created = 0;
  let skipped = 0;
  for (const emp of empList) {
    const { data: existing } = await supabase
      .from("onboarding_runs")
      .select("id")
      .eq("employee_id", emp.id)
      .maybeSingle();
    if (existing) {
      console.log(`  · ${emp.full_name} : run déjà présent`);
      skipped += 1;
      continue;
    }

    const { data: newRun, error: runErr } = await supabase
      .from("onboarding_runs")
      .insert({ employee_id: emp.id, template_id: tpl.id })
      .select("id")
      .single();
    if (runErr) {
      console.error(`  ✗ ${emp.full_name} : run ${runErr.message}`);
      continue;
    }

    if (tplItems && tplItems.length > 0) {
      const rows = tplItems.map((t) => ({
        run_id: newRun.id,
        template_item_id: t.id,
        label: t.label,
        description: t.description,
        category: t.category,
        is_required: t.is_required,
        responsible_role: t.responsible_role,
        position: t.position,
      }));
      const { error: itemsErr } = await supabase.from("onboarding_run_items").insert(rows);
      if (itemsErr) {
        console.error(`  ✗ ${emp.full_name} : items ${itemsErr.message}`);
        continue;
      }
    }
    console.log(`  ✓ ${emp.full_name} : run créé (${tplItems?.length ?? 0} items)`);
    created += 1;
  }

  console.log(`\nDone. ${created} runs créés / ${skipped} déjà présents.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
