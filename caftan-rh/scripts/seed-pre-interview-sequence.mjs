#!/usr/bin/env node
// Seed la séquence "pre-interview-pipeline" :
// quand applications.status passe à 'pre_interview_sent' :
//   J+0 : email pre_interview_invite (déjà fait au moment de l'envoi en V1, mais on log)
//   J+3 : email pre_interview_relance
//   J+5 : email pre_interview_reserve + set_status -> 'wait_decision'
// Idempotent.

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

const SEQ = {
  slug: "pre-interview-pipeline",
  name: "Pré-entretien — relances",
  description:
    "Déclenchée quand une candidature passe à 'pre_interview_sent'. Relance J+3, mise en réserve J+5.",
  trigger_status: "pre_interview_sent",
  is_active: true,
  steps: [
    {
      position: 1,
      kind: "wait",
      delay_days: 3,
    },
    {
      position: 2,
      kind: "email",
      delay_days: 0,
      email_template_slug: "pre_interview_relance",
    },
    {
      position: 3,
      kind: "wait",
      delay_days: 2,
    },
    {
      position: 4,
      kind: "email",
      delay_days: 0,
      email_template_slug: "pre_interview_reserve",
    },
    {
      position: 5,
      kind: "set_status",
      delay_days: 0,
      set_status_to: "wait_decision",
    },
  ],
};

async function main() {
  const { steps, ...row } = SEQ;
  const { data: upserted, error: upErr } = await supabase
    .from("sequences")
    .upsert(row, { onConflict: "slug" })
    .select("id, slug")
    .single();
  if (upErr) {
    console.error(`✗ ${SEQ.slug}:`, upErr.message);
    process.exit(1);
  }
  const seqId = upserted.id;
  const { error: delErr } = await supabase
    .from("sequence_steps")
    .delete()
    .eq("sequence_id", seqId);
  if (delErr) {
    console.error("  ✗ reset steps:", delErr.message);
    process.exit(1);
  }
  const stepRows = steps.map((s) => ({ sequence_id: seqId, ...s }));
  const { error: insErr } = await supabase.from("sequence_steps").insert(stepRows);
  if (insErr) {
    console.error("  ✗ insert steps:", insErr.message);
    process.exit(1);
  }
  console.log(`OK ${SEQ.slug} — ${steps.length} étapes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
