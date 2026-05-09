#!/usr/bin/env node
// Seed 2 séquences exemples : "Pipeline standard" (déclenchée par 'contacted')
// et "Refus poli" (déclenchée par 'refused').

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

const SEQUENCES = [
  {
    slug: "pipeline-standard",
    name: "Pipeline standard",
    description:
      "Quand un candidat passe à 'contacté' : envoie l'invitation, attend 3 jours, puis notifie les RH si pas de réponse.",
    trigger_status: "contacted",
    is_active: true,
    steps: [
      {
        position: 1,
        kind: "email",
        delay_days: 0,
        email_template_slug: "invite",
      },
      {
        position: 2,
        kind: "wait",
        delay_days: 3,
      },
      {
        position: 3,
        kind: "notification",
        delay_days: 0,
        notification_target: "rh",
        notification_title: "Relance candidat",
        notification_body: "Pas de réponse depuis 3 jours, à relancer.",
      },
    ],
  },
  {
    slug: "refus-poli",
    name: "Refus poli",
    description:
      "Quand un candidat passe à 'refusé' : envoie le refus positif et trace une note interne.",
    trigger_status: "refused",
    is_active: true,
    steps: [
      {
        position: 1,
        kind: "email",
        delay_days: 0,
        email_template_slug: "refuse_positive",
      },
      {
        position: 2,
        kind: "note",
        delay_days: 0,
        note_body: "Refus envoyé par séquence automatique.",
      },
    ],
  },
];

async function main() {
  for (const seq of SEQUENCES) {
    const { steps, ...row } = seq;
    const { data: upserted, error: upErr } = await supabase
      .from("sequences")
      .upsert(row, { onConflict: "slug" })
      .select("id, slug")
      .single();
    if (upErr) {
      console.error(`✗ ${seq.slug}:`, upErr.message);
      continue;
    }
    const seqId = upserted.id;
    // Replace steps idempotently.
    const { error: delErr } = await supabase.from("sequence_steps").delete().eq("sequence_id", seqId);
    if (delErr) {
      console.error(`  ✗ couldn't reset steps for ${seq.slug}:`, delErr.message);
      continue;
    }
    const stepRows = steps.map((s) => ({ sequence_id: seqId, ...s }));
    const { error: insErr } = await supabase.from("sequence_steps").insert(stepRows);
    if (insErr) {
      console.error(`  ✗ steps for ${seq.slug}:`, insErr.message);
      continue;
    }
    console.log(`✓ ${seq.slug} (${seq.name}) — ${steps.length} étapes`);
  }
  console.log(`\nDone. ${SEQUENCES.length} séquences seeded.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
