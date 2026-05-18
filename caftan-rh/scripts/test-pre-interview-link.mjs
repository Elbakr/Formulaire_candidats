// Karim 18/05 : simule le rendering complet du template pre_interview_invite
// pour un candidat existant -> verifie que {{link}} et {{deadline}} sont
// correctement substitues. Pas d'envoi reel, juste affichage du HTML.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "(NON DEFINI)";
console.log(`\nNEXT_PUBLIC_SITE_URL = ${baseUrl}\n`);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// 1. Recupere le candidat de test (le dernier sync)
const { rows: cands } = await c.query(`
  select a.id as app_id, c.id as cand_id, c.full_name, c.email
  from candidates c join applications a on a.candidate_id = c.id
  where c.source = 'gravity_forms'
  order by c.created_at desc limit 1
`);
if (cands.length === 0) { console.log("Aucun candidat trouve."); await c.end(); process.exit(1); }
const cand = cands[0];
console.log(`Candidat test : ${cand.full_name} <${cand.email}> (app ${cand.app_id})\n`);

// 2. Cree ou reutilise un pre_interview
const { rows: existing } = await c.query(`
  select token, expires_at from pre_interviews
  where application_id = $1 and status in ('sent','started')
  order by created_at desc limit 1
`, [cand.app_id]);
let token, expiresAt;
if (existing.length > 0) {
  token = existing[0].token;
  expiresAt = existing[0].expires_at;
  console.log(`Pre-interview existant reutilise.`);
} else {
  token = randomBytes(24).toString("base64url");
  const exp = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  expiresAt = exp.toISOString();
  await c.query(`
    insert into pre_interviews (application_id, position_role, token, language_code, sent_at, expires_at, status)
    values ($1, 'all', $2, 'fr', now(), $3, 'sent')
  `, [cand.app_id, token, expiresAt]);
  console.log(`Pre-interview cree.`);
}

const link = baseUrl !== "(NON DEFINI)" ? `${baseUrl.replace(/\/$/, "")}/pre-interview/${token}` : `/pre-interview/${token}`;
const deadline = new Intl.DateTimeFormat("fr-BE", { dateStyle: "long" }).format(new Date(expiresAt));

console.log(`\n🔗 LIEN GENERE :`);
console.log(`   ${link}\n`);
console.log(`📅 DEADLINE : ${deadline}\n`);

// 3. Charge le template pre_interview_invite et substitue
const { rows: tmpls } = await c.query(`select subject, body_html from email_templates where slug = 'pre_interview_invite'`);
if (tmpls.length === 0) { console.log("Template pre_interview_invite introuvable."); await c.end(); process.exit(1); }
const t = tmpls[0];

const vars = {
  org_name: "Caftan Factory",
  firstname: cand.full_name.split(" ")[0],
  fullname: cand.full_name,
  link,
  deadline,
  custom: "",
};
function renderTemplate(raw, vars) {
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}
const subject = renderTemplate(t.subject, vars);
const bodyRendered = renderTemplate(t.body_html, vars);

console.log(`📧 SUJET : ${subject}\n`);
console.log(`📝 EXTRAIT HTML (recherche du <a href>) :`);
const hrefMatch = bodyRendered.match(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
if (hrefMatch) {
  console.log(`   <a href="${hrefMatch[1]}">${hrefMatch[2].trim().slice(0, 60)}</a>`);
  if (hrefMatch[1] === "") {
    console.log(`   ❌ HREF VIDE -> bouton mort. {{link}} pas substitue.`);
  } else if (!hrefMatch[1].startsWith("http")) {
    console.log(`   ⚠ HREF relatif "${hrefMatch[1]}" -> pas cliquable depuis email externe.`);
    console.log(`   Cause : NEXT_PUBLIC_SITE_URL non defini OU lib pre-interview n a pas relu .env.local.`);
  } else {
    console.log(`   ✅ HREF absolu, le bouton sera cliquable.`);
  }
}

await c.end();
