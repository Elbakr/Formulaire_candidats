#!/usr/bin/env node
// Karim 2026-05-29 : test complet du flow signature stockee + envoi via
// hr@caftanfactory.com pour Karim Elbazi (sans passer par l UI bouton).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const BASE = process.env.DOCUSEAL_BASE_URL;
const KEY = process.env.DOCUSEAL_API_KEY;
const DB = process.env.DATABASE_URL;

// 1. Charge Karim Elbazi + signature stockee (s il y en a une)
const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows: emps } = await c.query("select * from employees where id = $1", ["cbc6d63a-ff65-44b7-bc6c-120c07f5a743"]);
const emp = emps[0];
const { rows: profs } = await c.query("select id, signature_data_url from profiles limit 1");
const sig = profs[0]?.signature_data_url ?? null;
const { rows: tpls } = await c.query("select body_markdown from contract_templates where code = 'employee'");
const template = tpls[0].body_markdown;
await c.end();

console.log(`Employee : ${emp.full_name} (${emp.contract_type})`);
console.log(`Langue : ${emp.preferred_language ?? "fr"}`);
console.log(`Signature stockee : ${sig ? "OUI (" + sig.length + " chars)" : "NON - test sera en mode 2-signataires"}`);

// 2. Render markdown
const today = new Date().toISOString().slice(0, 10);
const vars = {
  employer_name: "AMD MEGASTORE SRL",
  employer_bce: "BCE 0660.936.422",
  employer_address: "Rue de Brabant 230",
  employer_locality: "1030 Schaerbeek",
  employer_representative: "Karim Elbazi",
  paritary_commission: "CP du commerce de détail indépendant n°201",
  employee_first_name: emp.full_name.split(" ")[0],
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
function render(md) {
  let out = md.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, n, inner) => (vars[n] == null || vars[n] === "") ? "" : inner);
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, n) => vars[n] ?? "_______");
  return out;
}
const rendered = render(template);

// 3. HTML simplifie pour test
const sigBlock = sig
  ? `<img src="${sig}" alt="Signature" style="display:block;max-width:100%;max-height:80px;margin:0 auto 4px"><div style="font-size:9pt">Pré-signé par <strong>Karim Elbazi</strong> le ${today}</div>`
  : `<signature-field name="Signature employeur" role="Employer" required="true" style="display:block;width:100%;height:80px;margin:0 auto 4px"></signature-field><div style="font-size:9pt">Date : <date-field name="Date employeur" role="Employer" required="true" style="display:inline-block;width:110px;height:20px"></date-field></div>`;

const fullHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Contrat Test</title>
<style>@page{size:A4;margin:2cm 1.8cm}body{font-family:Calibri,Arial,sans-serif;font-size:10pt;line-height:1.25;color:#000;max-width:21cm;margin:0 auto;padding:2cm 1.8cm}h1{font-size:14pt;text-align:center;text-transform:uppercase}.signatures{display:table;width:100%;table-layout:fixed;margin-top:1cm}.signatures .sig-cell{display:table-cell;width:50%;padding:0 0.5cm;vertical-align:top;text-align:center}.signatures .sig-title{font-size:10pt}.signatures .sig-sub{font-size:9pt;font-style:italic}</style>
</head><body>
${rendered.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join('')}
<p style="margin-top:1cm">Fait en deux exemplaires à <strong>Schaerbeek</strong>, le <strong>${today}</strong>.</p>
<div class="signatures"><div class="sig-cell">
<div class="sig-title">Signature du travailleur</div>
<div class="sig-sub">(et parapher toutes les pages)</div>
<signature-field name="Signature employee" role="Employee" required="true" style="display:block;width:100%;height:80px;margin:8px auto 4px"></signature-field>
<div style="font-size:9pt">Date : <date-field name="Date employee" role="Employee" required="true" style="display:inline-block;width:110px;height:20px"></date-field></div>
</div><div class="sig-cell">
<div class="sig-title">Signature de l'employeur ou de son délégué</div>
<div class="sig-sub">${sig ? "(pré-signée numériquement)" : "(et parapher toutes les pages)"}</div>
${sigBlock}
</div></div>
</body></html>`;

console.log(`\nHTML genere : ${fullHtml.length} chars`);

// 4. POST /templates/html
const tplRes = await fetch(`${BASE}/templates/html`, {
  method: "POST",
  headers: { "X-Auth-Token": KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ name: `KarimElbazi_LIVE_${Date.now()}`, html: fullHtml }),
});
const tplData = await tplRes.json();
if (!tplRes.ok) { console.error("Template fail:", tplRes.status, JSON.stringify(tplData).slice(0, 300)); process.exit(1); }
console.log(`Template id : ${tplData.id}`);

// 5. POST /submissions (send_email FALSE pour qu on envoie via EmailJS)
const submitters = sig
  ? [{ role: "Employee", name: emp.full_name, email: emp.email }]
  : [
      { role: "Employer", name: "Karim Elbazi", email: "elbazikarim@gmail.com" },
      { role: "Employee", name: emp.full_name, email: emp.email },
    ];
const subRes = await fetch(`${BASE}/submissions`, {
  method: "POST",
  headers: { "X-Auth-Token": KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    template_id: tplData.id,
    send_email: false,
    reply_to: "hr@caftanfactory.com",
    submitters,
    metadata: { employee_id: emp.id, test: "karim_live" },
  }),
});
const subData = await subRes.json();
if (!subRes.ok) { console.error("Submission fail:", subRes.status, JSON.stringify(subData).slice(0, 300)); process.exit(1); }
const employeeSubmitter = subData.find(s => s.role === "Employee");
const signingUrl = employeeSubmitter?.embed_src;
console.log(`Submission id : ${employeeSubmitter?.submission_id}`);
console.log(`Signing URL (employee) : ${signingUrl ? signingUrl.slice(0, 80) + "..." : "MANQUANTE"}`);

// 6. Envoie mail via EmailJS depuis hr@caftanfactory.com
if (signingUrl) {
  const SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const PUBLIC = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  const firstName = emp.full_name.split(" ")[0];
  const subject = `Bienvenue chez AMD MEGASTORE SRL — Votre contrat à signer`;
  const body = `Bonjour ${firstName},\n\nNous vous souhaitons la bienvenue dans l'équipe AMD MEGASTORE SRL !\n\nVotre contrat de travail est prêt et a déjà été signé par notre direction. Il ne vous reste plus qu'à le signer électroniquement en cliquant sur le lien sécurisé ci-dessous :\n\n👉 ${signingUrl}\n\nUne fois signé, vous recevrez automatiquement une copie complète du contrat par mail.\n\nSi vous avez la moindre question, répondez simplement à ce mail.\n\nBien à vous,\nL'équipe RH de AMD MEGASTORE SRL`;
  const params = {
    to_email: emp.email, email: emp.email, user_email: emp.email, candidate_email: emp.email,
    to: emp.email, to_name: emp.full_name, name: emp.full_name, candidate_name: emp.full_name,
    from_name: "HR AMD MEGASTORE SRL", reply_to: "hr@caftanfactory.com",
    subject, message: body, html_message: body.replace(/\n/g, "<br>"),
    body, html: body.replace(/\n/g, "<br>"), content: body,
    signing_url: signingUrl,
  };
  const mailRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ service_id: SERVICE, template_id: TEMPLATE, user_id: PUBLIC, template_params: params }),
  });
  console.log(`\nEmail envoye : HTTP ${mailRes.status}`);
  console.log(`Destinataire : ${emp.email} (depuis hr@caftanfactory.com)`);
  console.log(`Subject : ${subject}`);
  if (mailRes.status !== 200) {
    console.error("Mail body:", (await mailRes.text()).slice(0, 200));
  }
}

console.log(`\n=== Test KARIM ELBAZI termine ===`);
console.log(sig ? `Mode : PRE-SIGNE (signature stockee de Karim apposee)` : `Mode : 2 signataires (Karim doit signer puis l employee)`);
