#!/usr/bin/env node
// Karim 2026-05-29 : test end-to-end du flow DocuSeal.
// 1. Charge Karim Elbazi de la BD
// 2. Render le template markdown employee (CDD plein temps)
// 3. POST /templates/html sur DocuSeal
// 4. POST /submissions avec 2 signataires (Karim employer + Karim employee)
// 5. Affiche les URLs de signature
// Resultat : 2 mails envoyes par DocuSeal a elbazikarim@gmail.com

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const BASE = process.env.DOCUSEAL_BASE_URL;
const KEY = process.env.DOCUSEAL_API_KEY;
const DB = process.env.DATABASE_URL;

if (!BASE || !KEY || !DB) {
  console.error("Missing env (DOCUSEAL_*, DATABASE_URL)");
  process.exit(1);
}

// 1. Load Karim from DB
const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows: emps } = await c.query(
  "select * from employees where id = $1",
  ["cbc6d63a-ff65-44b7-bc6c-120c07f5a743"],
);
if (emps.length === 0) { console.error("Karim Elbazi introuvable"); process.exit(1); }
const emp = emps[0];
console.log(`Employe : ${emp.full_name} (${emp.contract_type})`);

// 2. Load template markdown
const { rows: tpls } = await c.query("select body_markdown from contract_templates where code = 'employee'");
const templateMd = tpls[0]?.body_markdown ?? "";
console.log(`Template employee : ${templateMd.length} chars`);
await c.end();

// 3. Inline les variables (port simplifie du contract-renderer)
const today = new Date().toISOString().slice(0, 10);
const vars = {
  employer_name: "AMD MEGASTORE SRL",
  employer_bce: "BCE 0660.936.422",
  employer_address: "Rue de Brabant 230",
  employer_locality: "1030 Schaerbeek",
  employer_representative: "Karim Elbazi",
  paritary_commission: "CP du commerce de détail indépendant n°201",
  employee_first_name: emp.full_name.split(" ")[0] ?? "",
  employee_last_name: emp.full_name.split(" ").slice(1).join(" "),
  employee_niss: emp.nrn ?? "",
  employee_address: emp.address ?? "",
  start_date: emp.start_date?.toISOString().slice(0, 10) ?? today,
  end_date: emp.end_date?.toISOString().slice(0, 10) ?? "",
  contract_duration: "une durée déterminée",
  position: emp.job_title ?? "Employé(e)",
  weekly_hours: emp.weekly_hours ?? "",
  iban: emp.iban ?? "",
  contract_location: "Schaerbeek",
  contract_date: today,
};

function render(md, vars) {
  let out = md.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, name, inner) => {
    const v = vars[name];
    return (v == null || v === "" || v === "0") ? "" : inner;
  });
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
    const v = vars[name];
    return (v == null || v === "") ? "_______" : String(v);
  });
  return out;
}

const rendered = render(templateMd, vars);

// 4. Markdown -> HTML simple
function mdToHtml(md) {
  let html = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
  const blocks = html.split(/\n\n+/);
  return blocks.map((b) => (b.startsWith("<h") || b.startsWith("<li") ? b : `<p>${b.replace(/\n/g, "<br>")}</p>`)).join("\n");
}

const bodyHtml = mdToHtml(rendered);
const fullHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Contrat ${emp.full_name}</title>
<style>body{font-family:sans-serif;line-height:1.5;max-width:800px;margin:2rem auto;padding:0 2rem}.signatures{margin-top:4rem;display:grid;grid-template-columns:1fr 1fr;gap:4rem;page-break-before:always}.sig-block{border-top:1px solid #888;padding-top:1rem}.sig-label{font-size:0.85rem;color:#555;font-weight:bold}</style>
</head><body>
${bodyHtml}
<div class="signatures">
  <div class="sig-block">
    <div class="sig-label">Pour l'employeur (AMD MEGASTORE SRL)</div>
    <signature-field name="Signature employeur" role="Employer" required="true"></signature-field>
    <date-field name="Date employeur" role="Employer" required="true"></date-field>
  </div>
  <div class="sig-block">
    <div class="sig-label">Pour le travailleur (${emp.full_name})</div>
    <signature-field name="Signature employee" role="Employee" required="true"></signature-field>
    <date-field name="Date employee" role="Employee" required="true"></date-field>
  </div>
</div>
</body></html>`;

console.log(`\nHTML genere : ${fullHtml.length} chars`);

// 5. POST /templates/html
console.log("\nPOST /templates/html ...");
const tplRes = await fetch(`${BASE.replace(/\/$/, "")}/templates/html`, {
  method: "POST",
  headers: { "X-Auth-Token": KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ name: `TEST_CDD_${emp.full_name}_${Date.now()}`, html: fullHtml }),
});
const tplText = await tplRes.text();
console.log(`  HTTP ${tplRes.status}`);
if (!tplRes.ok) { console.error("Echec :", tplText.slice(0, 400)); process.exit(1); }
const tplData = JSON.parse(tplText);
console.log(`  Template id : ${tplData.id}`);
console.log(`  Template name : ${tplData.name}`);

// 6. POST /submissions
console.log("\nPOST /submissions ...");
const subRes = await fetch(`${BASE.replace(/\/$/, "")}/submissions`, {
  method: "POST",
  headers: { "X-Auth-Token": KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    template_id: tplData.id,
    send_email: true,
    submitters: [
      { role: "Employer", name: "Karim Elbazi (employer)", email: "elbazikarim@gmail.com" },
      { role: "Employee", name: emp.full_name, email: "elbazikarim@gmail.com" },
    ],
    metadata: { employee_id: emp.id, test: "true" },
  }),
});
const subText = await subRes.text();
console.log(`  HTTP ${subRes.status}`);
if (!subRes.ok) { console.error("Echec :", subText.slice(0, 400)); process.exit(1); }
const subData = JSON.parse(subText);
console.log(`\nSubmission cree :`);
for (const s of subData) {
  console.log(`  - submission ${s.submission_id} | role=${s.role} | email=${s.email}`);
}
console.log(`\n=== TEST OK ===`);
console.log(`Verifie tes mails sur elbazikarim@gmail.com (2 mails de signature)`);
console.log(`Tu peux signer en cliquant sur le lien dans chaque mail.`);
