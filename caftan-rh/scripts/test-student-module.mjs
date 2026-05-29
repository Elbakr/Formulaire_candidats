#!/usr/bin/env node
// Karim 2026-05-29 : test via le VRAI code module (pas un HTML inline).
// Reproduit exactement ce que fait le bouton "Envoyer a signer" student.
// L objectif : recreer le mail 22h01 (template 3958179 student) qui etait validé.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

// Importe le vrai module
const flow = await import("../src/lib/docuseal-flow.ts").catch(async () => {
  // tsx fallback : on doit compiler le TS a la volee
  console.log("Import direct TS failed, using tsx...");
  return null;
});

if (!flow) {
  // Approche : appel direct du code module via tsx exec
  console.log("Lance plutot le test via npx tsx :");
  console.log("npx tsx scripts/test-student-module.mjs");
  process.exit(0);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows: emps } = await c.query("select * from employees where id = $1", ["cbc6d63a-ff65-44b7-bc6c-120c07f5a743"]);
const emp = emps[0];
const { rows: profs } = await c.query("select signature_data_url from profiles where id = 'ae584efa-0c7d-4ccf-be30-3f49a28fb0c5'");
const sig = profs[0]?.signature_data_url ?? null;
const { rows: tpls } = await c.query("select body_markdown from contract_templates where code = 'student'");
const tplMd = tpls[0].body_markdown;
await c.end();

console.log(`Employee: ${emp.full_name}, markdown student: ${tplMd.length} chars, sig: ${sig?.length ?? 0} chars`);

// Utilise le code module exactement comme le bouton UI
const result = await flow.createDocusealTemplateFromContract({
  templateCode: "student",
  templateBodyMarkdown: tplMd,
  employeeData: emp,
  employerOrg: "amd_megastore",
  primarySite: null,
  employerSignatureDataUrl: sig,
});

if (!result.ok) { console.error("FAIL:", result.error); process.exit(1); }
console.log(`Template id (student via module): ${result.templateId}`);

const sub = await flow.createSubmissionForContract({
  templateId: result.templateId,
  employeeName: emp.full_name,
  employeeEmail: emp.email,
  employerName: "Karim Elbazi",
  employerEmail: "elbazikarim@gmail.com",
  language: "fr",
  preSigned: !!sig,
  replyTo: "hr@caftanfactory.com",
  metadata: { employee_id: emp.id, test: "student_module_v6" },
});

if (!sub.ok) { console.error("Submission fail:", sub.error); process.exit(1); }
console.log(`Submission: ${sub.submissionId}`);
const employeeUrl = sub.signingUrls.find((u) => u.role === "Employee")?.url;
console.log(`Signing URL: ${employeeUrl}`);
