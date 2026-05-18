// Karim 18/05 : conversion Q30 (langues) et Q60 (situation) en QCM.
// Le candidat clique des cases au lieu de taper.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const Q30_CHOICES = [
  { label: "Français", value: "fr" },
  { label: "Arabe", value: "ar" },
  { label: "Néerlandais", value: "nl" },
  { label: "Anglais", value: "en" },
  { label: "Espagnol", value: "es" },
  { label: "Turc", value: "tr" },
  { label: "Berbère", value: "ber" },
  { label: "Autre", value: "autre" },
];

const Q60_CHOICES = [
  { label: "En emploi (CDI/CDD)", value: "emploi" },
  { label: "Études", value: "etudes" },
  { label: "Demandeur·se d'emploi", value: "demandeur" },
  { label: "Intérim ponctuel", value: "interim" },
  { label: "Reconversion", value: "reconversion" },
  { label: "Autre", value: "autre" },
];

console.log(`\n=== Conversion Q30 + Q60 en QCM (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

const updates = [
  {
    sort: 30, kind: "multi_choice",
    prompt: "Quelles langues parlez-vous au quotidien ? (plusieurs choix possibles)",
    choices: Q30_CHOICES, min_chars: null,
  },
  {
    sort: 60, kind: "single_choice",
    prompt: "Quelle est votre situation actuelle ?",
    choices: Q60_CHOICES, min_chars: null,
  },
];

for (const u of updates) {
  const { rows } = await c.query(
    `select id, kind from pre_interview_questions where position_role='all' and sort_order=$1`,
    [u.sort],
  );
  if (rows.length === 0) { console.log(`Q${u.sort} non trouvee.`); continue; }
  console.log(`[Q${u.sort}] ${rows[0].kind} -> ${u.kind} (${u.choices.length} options)`);
  if (APPLY) {
    await c.query(
      `update pre_interview_questions set kind = $1, prompt = $2, choices = $3::jsonb, min_chars = $4, max_chars = null where id = $5`,
      [u.kind, u.prompt, JSON.stringify(u.choices), u.min_chars, rows[0].id],
    );
    console.log(`   ✓ mise a jour.`);
  }
}

// Reset reponses orphelines pour Q30/Q60 (anciennes valeurs text obsolètes)
// pour permettre aux candidats deja avances de re-cocher proprement.
if (APPLY) {
  const { rowCount } = await c.query(`
    delete from pre_interview_responses
    where question_id in (
      select id from pre_interview_questions where position_role='all' and sort_order in (30,60)
    )
    and pre_interview_id in (select id from pre_interviews where status in ('sent','started'))
  `);
  console.log(`\nReponses Q30+Q60 sur pre-interviews actifs reset : ${rowCount}`);
}

await c.end();
console.log(APPLY ? "\n✅ Termine." : "\n[DRY-RUN]");
