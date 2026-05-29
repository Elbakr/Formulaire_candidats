#!/usr/bin/env node
// Karim 2026-05-29 v8 FINAL : grave en BD le contenu definitif des templates
// avec :
// 1. Doublons RETIRES (Fait en deux exemplaires + Signatures + Parapher +
//    Biffer = deja dans le HTML wrapper)
// 2. Employee (temps plein) : ☒ 38h fixe (deja le defaut, on garde)
// 3. Employee_pt (temps partiel) : ☒ horaire VARIABLE + mention planning
//    fourni 7 jours a l avance au travailleur
// 4. Lieu de travail : "Rue de Brabant 230, 1030 Schaerbeek" + mention
//    "ou tout autre lieu d etablissement selon les besoins de l entreprise"
// 5. Salaire : "au bareme en vigueur de la CP 201" au lieu du gross_salary

import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { writeFileSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

for (const code of ["employee", "employee_pt", "student"]) {
  const { rows } = await c.query("select body_markdown from contract_templates where code = $1", [code]);
  let md = rows[0].body_markdown;
  const beforeLen = md.length;

  // ============ STEP 1 : RETIRER DOUBLONS ============
  // Bloc "Fait en deux exemplaires + Chacune des parties + Signatures + Parapher + Biffer"
  // (ces blocs sont rendus par le HTML wrapper buildContractHtmlForDocuseal)
  md = md.replace(/\n*Fait en deux exemplaires[\s\S]*?\*Biffer la mention inutile\*\s*\n/m, "\n");
  // Au cas ou il reste des mentions isolees
  md = md.replace(/^\*\(et parapher toutes les pages\)\*\s*$/gm, "");
  md = md.replace(/^\*Biffer la mention inutile\*\s*$/gm, "");
  md = md.replace(/^\*\*Signature du travailleur\*\*\s*$/gm, "");
  md = md.replace(/^\*\*Signature de l['']employeur[^*]*\*\*\s*$/gm, "");
  md = md.replace(/^Chacune des parties reconnaît[^.]*\.\s*$/gm, "");

  // ============ STEP 2 : LIEU DE TRAVAIL ============
  // Ajoute "ou tout autre lieu d etablissement selon les besoins de l entreprise"
  if (code === "employee" || code === "employee_pt") {
    md = md.replace(
      /Le lieu de travail est situé à : \*\*\{\{workplace\}\}\*\*/g,
      "Le lieu de travail est situé à : **{{workplace}}**, ou tout autre lieu d'établissement de l'employeur selon les besoins de l'entreprise.",
    );
  }
  if (code === "student") {
    md = md.replace(
      /L'étudiant est engagé pour travailler à : \(indiquer le lieu de l'exécution du contrat\) \*\*\{\{workplace\}\}\*\*/g,
      "L'étudiant est engagé pour travailler à : **{{workplace}}**, ou tout autre lieu d'établissement de l'employeur selon les besoins de l'entreprise.",
    );
  }

  // ============ STEP 3 : SALAIRE AU BAREME ============
  // employee + employee_pt + student
  md = md.replace(
    /A la date du présent contrat, la rémunération convenue est fixée à \*\*\{\{gross_salary\}\} € bruts\*\* de l'heure\*, \*\*par \{\{salary_period\}\}\*\*\./g,
    "La rémunération convenue est fixée selon le **barème salarial en vigueur de la Commission Paritaire n°201** (commerce de détail indépendant), conformément aux dispositions sectorielles applicables.",
  );
  md = md.replace(
    /La rémunération convenue est fixée à \*\*\{\{gross_salary\}\} € bruts\*\* de l'heure\*, \*\*par \{\{salary_period\}\}\*\*\./g,
    "La rémunération convenue est fixée selon le **barème salarial en vigueur de la Commission Paritaire n°201** (commerce de détail indépendant), conformément aux dispositions sectorielles applicables.",
  );

  // ============ STEP 4 : EMPLOYEE_PT - HORAIRE VARIABLE PAR DEFAUT ============
  if (code === "employee_pt") {
    // Decocher horaire FIXE (38h fixe + cycle fixe)
    md = md.replace(
      /☒ à \*\*\{\{weekly_hours\}\}h par semaine\*\* suivant l'\*\*horaire fixe\*\*/g,
      "☐ à **{{weekly_hours}}h par semaine** suivant l'**horaire fixe**",
    );
    // Cocher horaire VARIABLE (semaine ou cycle)
    md = md.replace(
      /☐ à \{\{weekly_hours\}\}h par semaine\* ou à \{\{weekly_hours\}\}h sur un cycle/g,
      "☒ à {{weekly_hours}}h par semaine* ou à {{weekly_hours}}h sur un cycle",
    );
    // Ajoute la mention "planning fourni 7 jours a l avance"
    // Cherche la fin de la description horaire variable et ajoute la mention
    md = md.replace(
      /(\*Dans le cadre de ce régime de travail, l'\*\*horaire de travail\*\*[^*]+\*\*est variable[^*]+)\*/,
      "$1. L'horaire effectif est communiqué au travailleur **au moins 7 jours calendaires à l'avance** par voie d'affichage à l'établissement ou par tout autre moyen écrit.*",
    );
  }

  // ============ STEP 5 : STUDENT - HORAIRE VARIABLE PAR DEFAUT ============
  if (code === "student") {
    md = md.replace(
      /☒ À \*\*\{\{weekly_hours\}\} heures par semaine\*\* et est repartie/g,
      "☐ À **{{weekly_hours}} heures par semaine** et est repartie",
    );
    md = md.replace(
      /☐ à \{\{weekly_hours\}\}h par semaine\* suivant un horaire variable/g,
      "☒ à {{weekly_hours}}h par semaine* suivant un horaire variable",
    );
  }

  // ============ STEP 6 : EMPLOYEE - GARDE HORAIRE FIXE COCHE (38h) ============
  // (Karim a dit : "temps plein cocher par defaut la 1ere case 38h" - deja le cas)
  // Donc on s assure que ☒ "38 heures par semaine" reste coche
  if (code === "employee") {
    // Verifier que la 1ere case (fixe 38h) est bien cochee
    if (!md.includes("☒ À **{{weekly_hours}} heures par semaine**")) {
      md = md.replace(
        /☐ À \*\*\{\{weekly_hours\}\} heures par semaine\*\*/g,
        "☒ À **{{weekly_hours}} heures par semaine**",
      );
    }
  }

  // ============ NORMALISE : pas plus de 3 lignes vides successives ============
  md = md.replace(/\n{4,}/g, "\n\n\n");
  md = md.replace(/\n\s*\n\s*\n/g, "\n\n"); // max 2 sauts

  const afterLen = md.length;
  console.log(`${code} : ${beforeLen} -> ${afterLen} chars (delta: ${afterLen - beforeLen})`);
  await c.query("update contract_templates set body_markdown = $1, updated_at = now() where code = $2", [md, code]);
}

console.log("\n=== Migration v8 finale appliquee ===");

// Genere migration SQL pour archiver en git
let sql = `-- Karim 2026-05-29 v8 FINAL : templates definitifs graves en pierre
-- 1. Doublons retires (Fait en deux exemplaires + Signatures + Parapher + Biffer
--    sont rendus par le HTML wrapper docuseal-flow.ts)
-- 2. Employee (temps plein) : 38h fixe coche par defaut
-- 3. Employee_pt (temps partiel) : horaire VARIABLE coche + mention planning
--    fourni 7 jours a l avance
-- 4. Student : horaire VARIABLE coche par defaut
-- 5. Lieu de travail : workplace + "ou tout autre lieu selon besoins entreprise"
-- 6. Salaire : "au bareme en vigueur de la CP 201" au lieu du gross_salary

`;
for (const code of ["employee", "employee_pt", "student"]) {
  const { rows } = await c.query("select body_markdown from contract_templates where code = $1", [code]);
  sql += `\nupdate public.contract_templates set body_markdown = $contract_v8$${rows[0].body_markdown}$contract_v8$, updated_at = now() where code = '${code}';\n`;
}
writeFileSync(resolve(__dirname, "../../supabase/migrations/20260620000560_contracts_v8_final.sql"), sql);
writeFileSync(resolve(__dirname, "../supabase/migrations/20260620000560_contracts_v8_final.sql"), sql);
console.log(`Migration SQL ecrite (${sql.length} chars)`);

await c.end();
