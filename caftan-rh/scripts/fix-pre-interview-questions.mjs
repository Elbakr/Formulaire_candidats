// Karim 18/05 : ameliorations UX questions pre-entretien.
//
// 1. Q40 "A partir de quelle date..." text -> single_choice avec options
//    Immediatement / 1-2 sem / 1 mois / Plus tard. Le candidat clique un
//    bouton au lieu de devoir taper du texte.
// 2. Q70 "Comment etre recontacte" single_choice -> multi_choice
//    (Karim peut etre joint sur plusieurs canaux : tel + email + whatsapp).
// 3. Ajout Q45 facultatif text "Date precise ou contraintes" pour les
//    candidats qui ont besoin de preciser.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log(`\n=== Pre-interview questions UX fix (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

// Q40 : text -> single_choice
const Q40_CHOICES = [
  { label: "Immédiatement", value: "immediat" },
  { label: "Dans 1-2 semaines", value: "1_2_sem" },
  { label: "Dans 1 mois", value: "1_mois" },
  { label: "Plus tard (préciser ci-dessous)", value: "plus_tard" },
];
console.log("[1] Q40 : conversion text -> single_choice");
const { rows: q40Rows } = await c.query(`
  select id, kind from pre_interview_questions
  where position_role = 'all' and sort_order = 40
`);
if (q40Rows.length === 0) {
  console.log("   ✗ Q40 non trouvee.");
} else {
  console.log(`   Avant : kind=${q40Rows[0].kind}, choices=null`);
  console.log(`   Apres : kind=single_choice, choices=${Q40_CHOICES.map(c => c.label).join(" / ")}`);
  if (APPLY) {
    await c.query(
      `update pre_interview_questions set kind = 'single_choice', choices = $1::jsonb, prompt = $2, min_chars = null, max_chars = null
       where id = $3`,
      [JSON.stringify(Q40_CHOICES), "Quand pouvez-vous commencer ?", q40Rows[0].id],
    );
    console.log("   ✓ Q40 mise a jour.");
  }
}

// Q45 nouveau (facultatif)
console.log("\n[2] Q45 : nouveau text facultatif pour preciser date/contraintes");
const { rows: q45Existing } = await c.query(`
  select id from pre_interview_questions where position_role = 'all' and sort_order = 45
`);
if (q45Existing.length > 0) {
  console.log("   Q45 deja existante, skip.");
} else if (APPLY) {
  await c.query(
    `insert into pre_interview_questions (slug, position_role, sort_order, prompt, kind, is_required, min_chars, max_chars)
     values ('all_45_date_precise', 'all', 45, $1, 'text', false, null, 500)`,
    ["Une date précise ou des contraintes (jours, horaires, congés...) ?"],
  );
  console.log("   ✓ Q45 creee.");
}

// Q70 : single_choice -> multi_choice
console.log("\n[3] Q70 : single_choice -> multi_choice (tel + email + whatsapp possibles)");
const { rows: q70Rows } = await c.query(`
  select id, kind from pre_interview_questions
  where position_role = 'all' and sort_order = 70
`);
if (q70Rows.length === 0) {
  console.log("   ✗ Q70 non trouvee.");
} else {
  console.log(`   Avant : kind=${q70Rows[0].kind}`);
  console.log(`   Apres : kind=multi_choice (plusieurs canaux cochables)`);
  if (APPLY) {
    await c.query(
      `update pre_interview_questions set kind = 'multi_choice', prompt = $1 where id = $2`,
      ["Comment préférez-vous être recontacté·e ? (plusieurs choix possibles)", q70Rows[0].id],
    );
    console.log("   ✓ Q70 mise a jour.");
  }
}

console.log("\n--- Etat final ---");
const { rows: after } = await c.query(`
  select sort_order, kind, is_required, substring(prompt, 1, 60) as p
  from pre_interview_questions where position_role = 'all' order by sort_order
`);
for (const r of after) console.log(`  Q${r.sort_order} | ${r.kind.padEnd(14)} | req=${r.is_required} | ${r.p}`);

console.log(`\n${APPLY ? "✅ Termine." : "[DRY-RUN] Relance avec --apply."}\n`);
await c.end();
