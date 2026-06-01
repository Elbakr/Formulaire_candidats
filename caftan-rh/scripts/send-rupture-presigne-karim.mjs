#!/usr/bin/env node
// Karim 2026-06-01 : envoie une nouvelle rupture amiable PRÉ-SIGNÉE par Karim
// (signature stockée dans profiles.signature_data_url) à l'employee Karim Elbazi
// fictif. Le travailleur est alors seul signataire DocuSeal.
// Usage : cd caftan-rh && node scripts/send-rupture-presigne-karim.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const EMPLOYEE_ID = "cbc6d63a-ff65-44b7-bc6c-120c07f5a743"; // Karim Elbazi fictif
const ADMIN_EMAIL = "elbazikarim@gmail.com";

const DOCUSEAL_URL = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
const DOCUSEAL_KEY = process.env.DOCUSEAL_API_KEY;
const EMAILJS_SERVICE = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const EMAILJS_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

if (!DOCUSEAL_URL || !DOCUSEAL_KEY) { console.error("[X] DocuSeal env missing"); process.exit(1); }
if (!EMAILJS_SERVICE || !EMAILJS_TEMPLATE || !EMAILJS_KEY) { console.error("[X] EmailJS env missing"); process.exit(1); }

// 1. Charge profile admin + signature + employee
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const adminQ = await c.query(`SELECT id, full_name, signature_data_url FROM profiles WHERE email=$1 LIMIT 1`, [ADMIN_EMAIL]);
const admin = adminQ.rows[0];
if (!admin?.signature_data_url) { console.error("[X] Pas de signature stockée pour", ADMIN_EMAIL); process.exit(1); }
console.log(`Admin: ${admin.full_name} (${admin.id})`);
console.log(`Signature: ${admin.signature_data_url.length} chars`);

const empQ = await c.query(`SELECT id, full_name, email, address, postal_code, city FROM employees WHERE id=$1`, [EMPLOYEE_ID]);
const emp = empQ.rows[0];
if (!emp) { console.error("[X] Employee introuvable"); process.exit(1); }
console.log(`Employee: ${emp.full_name} (${emp.email})`);

// 2. Crée une nouvelle row de rupture (status=approved, prête à envoyer)
const effective = new Date(); effective.setDate(effective.getDate() + 7); // +7 jours
const effectiveISO = effective.toISOString().slice(0, 10);
const termIns = await c.query(`
  INSERT INTO contract_terminations
    (employee_id, employer_org_key, initiated_by, initiator_profile_id, status,
     approver_profile_id, approved_at, effective_date, earliest_effective_date,
     city, employer_representative_name)
  VALUES ($1, 'amd_megastore', 'admin', $2, 'approved', $2, now(), $3, $4, 'Schaerbeek', $5)
  RETURNING id`,
  [EMPLOYEE_ID, admin.id, effectiveISO, effectiveISO, admin.full_name]);
const terminationId = termIns.rows[0].id;
console.log(`Nouvelle rupture: ${terminationId}, effective ${effectiveISO}`);

// 3. Render lettre 402.00 HTML AVEC signature image embedded (pré-signée)
const today = new Date();
const dateFR = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
const employerInfo = { name: "AMD MEGASTORE SRL", address: "Rue de Brabant 230", city: "1030 Schaerbeek" };
const employeeCity = emp.postal_code ? `${emp.postal_code} ${emp.city ?? ""}`.trim() : (emp.city ?? "");
const effectiveStr = effectiveISO.split("-").reverse().join("-").slice(0, 8);

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Cessation contrat - Commun accord</title>
<style>
  @page { size: A4 portrait; margin: 2.5cm 2.2cm; }
  body { font-family: 'Calibri', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #000; margin: 0; padding: 0; }
  h1.title { text-align: center; border: 1.5pt solid #000; padding: 8pt 10pt; font-size: 13.5pt; font-weight: 700; margin: 0 0 28pt 0; }
  .header-block { margin-bottom: 20pt; }
  .header-row { display: flex; align-items: baseline; margin-bottom: 4pt; }
  .header-row .col-side { width: 50pt; font-weight: 700; flex-shrink: 0; }
  .header-row .col-label { width: 100pt; font-weight: 700; flex-shrink: 0; }
  .header-row .col-value { flex: 1; }
  .header-row .col-label-light { width: 100pt; flex-shrink: 0; }
  .il-est { font-weight: 700; margin: 22pt 0 14pt 0; }
  p { margin: 0 0 12pt 0; text-align: justify; }
  .fait { margin: 26pt 0 14pt 0; }
  .signatures { display: flex; gap: 18pt; margin-top: 8pt; }
  .sig-box { flex: 1; border: 0.6pt solid #000; min-height: 90pt; padding: 6pt 8pt; font-size: 9.5pt; text-align: center; }
  .sig-box .sig-title { font-weight: 400; }
  .sig-box .sig-sub { font-size: 8pt; font-style: italic; }
</style></head><body>
<h1 class="title">CESSATION DU CONTRAT DE TRAVAIL DE COMMUN ACCORD</h1>
<div class="header-block">
  <div class="header-row"><div class="col-side">Entre</div><div class="col-label">L'employeur</div><div class="col-value">: ${employerInfo.name}</div></div>
  <div class="header-row"><div class="col-side"></div><div class="col-label-light">Adresse</div><div class="col-value">: ${employerInfo.address}</div></div>
  <div class="header-row"><div class="col-side"></div><div class="col-label-light">Localité</div><div class="col-value">: ${employerInfo.city}</div></div>
  <div class="header-row"><div class="col-side"></div><div class="col-label-light">Représenté par</div><div class="col-value">: ${admin.full_name}</div></div>
  <div class="header-row" style="margin-top:8pt;"><div class="col-side">Et</div><div class="col-label">le travailleur</div><div class="col-value">: ${emp.full_name}</div></div>
  <div class="header-row"><div class="col-side"></div><div class="col-label-light">Adresse</div><div class="col-value">: ${emp.address ?? ""}</div></div>
  <div class="header-row"><div class="col-side"></div><div class="col-label-light">Localité</div><div class="col-value">: ${employeeCity}</div></div>
</div>
<div class="il-est">IL EST CONVENU CE QUI SUIT :</div>
<p>Conformément aux dispositions de l'article 1134 du Code Civil, le contrat de travail liant les soussignés prend fin, de leur commun accord, le ${effectiveStr}</p>
<p>Cette cessation des relations de travail ne s'accompagne donc d'aucune notification de préavis ni d'aucun paiement d'une quelconque indemnité compensatoire de préavis.</p>
<p>Moyennant l'exécution de la présente convention, chacune des parties renonce à se prévaloir à l'égard de l'autre de tous droits nés ou à naître en raison ou à l'occasion des relations de travail ayant existé entre elles.</p>
<p>De plus, chaque partie renonce à se prévaloir de toute erreur de droit ou de fait et de toute omission relative à l'existence ou à l'étendue de ses droits.</p>
<p>Chaque partie reconnaît avoir reçu un exemplaire de la présente convention.</p>
<div class="fait">Fait en deux exemplaires à Schaerbeek, le ${dateFR}</div>
<div class="signatures">
  <div class="sig-box">
    <div class="sig-title">Signature du travailleur</div>
    <div style="margin-top: 10pt;">
      <signature-field name="Signature travailleur" role="Employee" required="true" style="display: block; width: 100%; height: 50pt;"></signature-field>
    </div>
    <div class="sig-sub" style="margin-top: 6pt;">Lu et approuvé — signé électroniquement le ${dateFR} (eIDAS UE n° 910/2014)</div>
  </div>
  <div class="sig-box">
    <div class="sig-title">Signature de l'employeur ou de son délégué</div>
    <div style="margin-top: 10pt;"><img src="${admin.signature_data_url}" alt="Signature employeur" style="display: block; max-width: 100%; max-height: 50pt; margin: 0 auto;"></div>
    <div class="sig-sub" style="margin-top: 6pt;">Lu et approuvé — signé électroniquement le ${dateFR} (eIDAS UE n° 910/2014)<br><em>(pré-signée numériquement)</em></div>
  </div>
</div>
</body></html>`;

// 4. POST template DocuSeal
console.log("→ Création template DocuSeal...");
const tplRes = await fetch(`${DOCUSEAL_URL}/templates/html`, {
  method: "POST",
  headers: { "X-Auth-Token": DOCUSEAL_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ name: `rupture_amiable_karim_${Date.now()}`, html }),
});
if (!tplRes.ok) { console.error("[X] DocuSeal template:", await tplRes.text()); process.exit(1); }
const tpl = await tplRes.json();
console.log(`✓ Template DocuSeal ${tpl.id}`);

// 5. POST submission - 1 seul signataire (Employee) puisque presigne
console.log("→ Création submission...");
const subRes = await fetch(`${DOCUSEAL_URL}/submissions`, {
  method: "POST",
  headers: { "X-Auth-Token": DOCUSEAL_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    template_id: tpl.id,
    send_email: false,
    reply_to: "hr@caftanfactory.com",
    submitters: [{ role: "Employee", name: emp.full_name, email: emp.email }],
    metadata: { termination_id: terminationId, presigned: "true" },
  }),
});
if (!subRes.ok) { console.error("[X] DocuSeal submission:", await subRes.text()); process.exit(1); }
const subData = await subRes.json();
const signingUrl = subData[0]?.embed_src;
const submissionId = subData[0]?.submission_id;
console.log(`✓ Submission ${submissionId}, URL: ${signingUrl}`);

await c.query(`UPDATE contract_terminations SET docuseal_submission_id=$1, status='sent_for_signature', sent_for_signature_at=now() WHERE id=$2`, [String(submissionId), terminationId]);

// 6. Envoi mail
const firstName = emp.full_name.split(" ")[0];
const body = `Bonjour ${firstName},

Une convention de cessation de contrat de travail de COMMUN ACCORD t'est transmise pour signature électronique.

⚠️ La signature de l'employeur est DEJA APPOSEE (signature pré-enregistrée par le délégué employeur).
Tu es donc le SEUL signataire restant.

Date de fin du contrat proposée : ${effectiveISO}

Pour signer la convention (PDF A4 légal, signature électronique sécurisée eIDAS) :
${signingUrl}

La signature électronique a la même valeur légale qu'une signature manuscrite
(règlement eIDAS UE n° 910/2014). Tu recevras automatiquement le PDF signé
final dès que tu auras signé.

Bien à toi,
L'équipe Caftan Factory (By AMD Megastore)`;

console.log("→ Envoi mail...");
const mailRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  body: JSON.stringify({
    service_id: EMAILJS_SERVICE, template_id: EMAILJS_TEMPLATE, user_id: EMAILJS_KEY,
    template_params: {
      to_email: emp.email, email: emp.email, user_email: emp.email, candidate_email: emp.email,
      to: emp.email, to_name: emp.full_name, name: emp.full_name, candidate_name: emp.full_name,
      from_name: "Caftan Factory (By AMD Megastore)", reply_to: "hr@caftanfactory.com",
      subject: "Convention de cessation de contrat — pré-signée, signature requise",
      message: body, html_message: body.replace(/\n/g, "<br>"),
      body, content: body, html: body.replace(/\n/g, "<br>"),
      pdf_url: signingUrl,
    },
  }),
});
console.log("Mail status:", mailRes.status);
if (!mailRes.ok) console.log("Mail err:", await mailRes.text());
else console.log(`✓ Mail envoyé à ${emp.email}`);

await c.end();
console.log("\n=== DONE ===");
console.log("Rupture ID:", terminationId);
console.log("DocuSeal Submission:", submissionId);
console.log("Signing URL:", signingUrl);
