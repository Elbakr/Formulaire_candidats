// Karim 2026-05-29 : flow complet d envoi d un contrat a signer via DocuSeal.
//
// Workflow (zero config manuelle dans DocuSeal UI) :
//   1. Render le markdown du contract_template avec les vraies donnees employee
//   2. Convertit le markdown rendu en HTML
//   3. POST /templates/html sur DocuSeal -> recupere template_id (cache 1h)
//   4. POST /submissions avec template_id + 2 signataires (employee + employer)
//   5. DocuSeal envoie les emails de signature
//   6. Webhook /api/docuseal/webhook met a jour la BD quand signe
//
// Karim 2026-05-29 (v2) : refonte visuelle complete pour matcher les PDF
// originaux du secretariat social belge. Style Calibri, A4 portrait, header
// encadre, articles soulignes/gras, cadres signature en bas. Voir
// scripts/preview-docuseal-layout.html pour previewer le rendu sans DocuSeal.

import { renderContractTemplate, buildContractVariables, EMPLOYER_ORGS, type EmployerOrgKey } from "@/lib/contract-renderer";

/**
 * Karim 2026-05-29 : escape HTML special pour eviter injection.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Karim 2026-05-29 : parse une ligne markdown inline (gras, italique).
 * Applique apres escapeHtml.
 */
function inlineMarkdown(text: string): string {
  return text
    // Gras : **texte**
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Italique : *texte* (apres le gras pour eviter conflits)
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/**
 * Karim 2026-05-29 : parse une table markdown
 *   | col1 | col2 |
 *   |------|------|
 *   | a    | b    |
 * Retourne le HTML <table> correspondant.
 */
function parseMarkdownTable(lines: string[]): string {
  if (lines.length < 2) return "";
  const headerCells = lines[0]
    .split("|")
    .slice(1, -1)
    .map((c) => inlineMarkdown(c.trim()));
  // ligne 2 = separateur |---|---|
  const bodyLines = lines.slice(2);
  const rows = bodyLines.map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((c) => inlineMarkdown(c.trim())),
  );
  const thead = `<thead><tr>${headerCells.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table class="md-table">${thead}${tbody}</table>`;
}

/**
 * Karim 2026-05-29 : convertit le markdown rendu en HTML structure pour le
 * style "secretariat social belge".
 *
 * Conventions speciales :
 *   - `## Article N.` ou `## Article N. Titre` => bloc article avec header
 *     souligne+gras (matche les PDF originaux)
 *   - `## ANNEXE : ...` => header d annexe (encadre)
 *   - `# TITRE` => titre principal (encadre, centre, MAJ)
 *   - Tables markdown gerees
 *   - Listes a tirets ou puces
 *   - Paragraphes separes par lignes vides
 *   - **gras** et *italique* inline
 */
function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  let inList = false;
  let inParagraph: string[] = [];

  const flushParagraph = () => {
    if (inParagraph.length > 0) {
      const txt = inParagraph
        .map((l) => inlineMarkdown(escapeHtml(l)))
        .join("<br>");
      out.push(`<p>${txt}</p>`);
      inParagraph = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Ligne vide => flush paragraphe / liste
    if (line.trim() === "") {
      flushParagraph();
      closeList();
      i++;
      continue;
    }

    // Separateur horizontal : --- (saut visuel)
    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph();
      closeList();
      out.push('<hr class="md-sep">');
      i++;
      continue;
    }

    // Detection table markdown : | col | col |
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1].trim())) {
      flushParagraph();
      closeList();
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      out.push(parseMarkdownTable(tableLines));
      continue;
    }

    // Titre principal # TITRE => encadre majuscule centre
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1) {
      flushParagraph();
      closeList();
      out.push(
        `<div class="doc-title"><h1>${inlineMarkdown(escapeHtml(h1[1]))}</h1></div>`,
      );
      i++;
      continue;
    }

    // Titre niveau 2 : ## Article N. ou ## ANNEXE : ...
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      flushParagraph();
      closeList();
      const title = h2[1].trim();
      // Special : "Article N." ou "Article N. Titre" => header souligne
      const isArticle = /^Article\s+\d+\.?/i.test(title);
      // Special : "ANNEXE : ..." => titre d annexe encadre
      const isAnnexe = /^ANNEXE/i.test(title);
      if (isAnnexe) {
        out.push(
          `<div class="doc-title doc-title-annexe"><h2>${inlineMarkdown(escapeHtml(title))}</h2></div>`,
        );
      } else if (isArticle) {
        out.push(
          `<h2 class="article-head">${inlineMarkdown(escapeHtml(title))}</h2>`,
        );
      } else {
        out.push(
          `<h2 class="section-head">${inlineMarkdown(escapeHtml(title))}</h2>`,
        );
      }
      i++;
      continue;
    }

    // Titre niveau 3
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) {
      flushParagraph();
      closeList();
      out.push(
        `<h3 class="subsection-head">${inlineMarkdown(escapeHtml(h3[1]))}</h3>`,
      );
      i++;
      continue;
    }

    // Liste a tirets/puces
    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      flushParagraph();
      if (!inList) {
        out.push('<ul class="md-list">');
        inList = true;
      }
      out.push(`<li>${inlineMarkdown(escapeHtml(listItem[1]))}</li>`);
      i++;
      continue;
    }

    // Sinon : ligne de paragraphe
    closeList();
    inParagraph.push(line);
    i++;
  }
  flushParagraph();
  closeList();
  return out.join("\n");
}

/**
 * Karim 2026-05-29 : feuille de style commune aux contrats. Imite la mise
 * en page des PDF du secretariat social belge (Calibri, A4, articles
 * soulignes, cadres signature). Format imprimable propre.
 */
const CONTRACT_CSS = `
  @page { size: A4 portrait; margin: 2.5cm 2.5cm 2cm 2.5cm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Calibri', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.35;
    color: #000;
    background: #fff;
    max-width: 21cm;
    margin: 0 auto;
    padding: 2.5cm 2.5cm 2cm 2.5cm;
  }
  /* Titre principal encadre (ex: "CONTRAT DE TRAVAIL D EMPLOYE") */
  .doc-title {
    border: 1px solid #000;
    padding: 0.55cm 0.4cm;
    margin-bottom: 0.6cm;
    text-align: center;
    page-break-after: avoid;
  }
  .doc-title h1 {
    margin: 0;
    font-size: 16pt;
    font-weight: bold;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .doc-title-annexe { margin-top: 1cm; }
  .doc-title-annexe h2 {
    margin: 0;
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  /* Encart "Entre / Et" (parties au contrat) */
  .parties-block {
    margin: 0.5cm 0 0.6cm 0;
    page-break-inside: avoid;
  }
  .parties-block .parties-line {
    display: flex;
    margin-bottom: 0.1cm;
    align-items: baseline;
  }
  .parties-block .col-prefix { width: 1.5cm; font-weight: bold; flex-shrink: 0; }
  .parties-block .col-label  { width: 2.6cm; font-weight: bold; flex-shrink: 0; }
  .parties-block .col-value  { flex: 1; }
  .parties-block .col-value strong { font-weight: bold; }
  .parties-block .dotted-line {
    flex: 1;
    border-bottom: 1px dotted #555;
    height: 1em;
    margin-left: 0.2cm;
  }
  /* "IL EST CONVENU CE QUI SUIT :" */
  .convenu-line {
    font-weight: bold;
    margin: 0.6cm 0 0.4cm 0;
    font-size: 10.5pt;
  }
  /* Headers d articles : "Article N." souligne + gras */
  h2.article-head {
    font-size: 11pt;
    font-weight: bold;
    text-decoration: underline;
    margin: 0.45cm 0 0.15cm 0;
    page-break-after: avoid;
  }
  h2.section-head {
    font-size: 11pt;
    font-weight: bold;
    margin: 0.5cm 0 0.2cm 0;
  }
  h3.subsection-head {
    font-size: 10.5pt;
    font-weight: bold;
    text-decoration: underline;
    margin: 0.4cm 0 0.15cm 0;
  }
  p {
    margin: 0.1cm 0 0.18cm 0;
    text-align: left;
  }
  /* Listes a puces (style carre noir comme les PDF) */
  ul.md-list {
    margin: 0.1cm 0 0.25cm 0.5cm;
    padding-left: 0.4cm;
    list-style-type: square;
  }
  ul.md-list li {
    margin-bottom: 0.08cm;
    padding-left: 0.1cm;
  }
  /* Separateur horizontal markdown --- */
  hr.md-sep {
    border: 0;
    border-top: 1px solid #bbb;
    margin: 0.5cm 0;
  }
  /* Tables markdown (preavis etudiant, etc.) */
  table.md-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.25cm 0;
    font-size: 10pt;
  }
  table.md-table th,
  table.md-table td {
    border: 1px solid #000;
    padding: 0.15cm 0.25cm;
    text-align: center;
    vertical-align: middle;
  }
  table.md-table th {
    background: #f3f3f3;
    font-weight: bold;
  }
  /* Bloc signature en 2 colonnes (cadres rectangulaires) */
  .signatures {
    margin-top: 1cm;
    display: table;
    width: 100%;
    table-layout: fixed;
    page-break-inside: avoid;
  }
  .signatures .sig-row { display: table-row; }
  .signatures .sig-cell {
    display: table-cell;
    width: 50%;
    padding: 0.2cm;
    vertical-align: top;
  }
  .signatures .sig-frame {
    border: 1px solid #000;
    padding: 0.3cm;
    min-height: 3.5cm;
    text-align: center;
  }
  .signatures .sig-title {
    font-size: 10pt;
    font-weight: normal;
    margin-bottom: 0.05cm;
  }
  .signatures .sig-sub {
    font-size: 9pt;
    font-style: italic;
    color: #333;
    margin-bottom: 0.3cm;
  }
  .signatures .sig-date {
    font-size: 9pt;
    color: #333;
    margin-top: 0.25cm;
    text-align: left;
  }
  /* "Fait en deux exemplaires a ... le ..." */
  .closing-line {
    margin-top: 0.7cm;
    font-size: 10.5pt;
  }
  .closing-line strong { font-weight: bold; }
  /* Pied de page (mentions legales) */
  .footer-mentions {
    margin-top: 1cm;
    font-size: 8pt;
    color: #444;
    border-top: 1px solid #ccc;
    padding-top: 0.2cm;
    text-align: center;
  }
  /* Styles d impression : DocuSeal converti le HTML en PDF */
  @media print {
    body { padding: 0; }
    .signatures { page-break-inside: avoid; }
    h2.article-head { page-break-after: avoid; }
  }
`;

/**
 * Karim 2026-05-29 : construit le bloc "Entre / Et" (parties au contrat)
 * en HTML structure (vs le rendu markdown standard, qui ne preserve pas
 * l alignement des PDF originaux).
 */
function buildPartiesBlockHtml(args: {
  employerName: string;
  employerAddress: string;
  employerLocality: string;
  employeeRoleLabel: string; // "L'employé", "L'ouvrier" (etudiant)
  employeeName: string;
  employeeNiss: string;
  employeeAddress: string;
  employeeLocality: string;
}): string {
  const e = (s: string) => escapeHtml(s);
  return `
<div class="parties-block">
  <div class="parties-line">
    <span class="col-prefix">Entre</span>
    <span class="col-label">L'employeur</span>
    <span class="col-value">: <strong>${e(args.employerName)}</strong></span>
  </div>
  <div class="parties-line">
    <span class="col-prefix"></span>
    <span class="col-label">Adresse</span>
    <span class="col-value">: ${e(args.employerAddress)}</span>
  </div>
  <div class="parties-line">
    <span class="col-prefix"></span>
    <span class="col-label">Localité</span>
    <span class="col-value">: ${e(args.employerLocality)}</span>
  </div>
  <div class="parties-line">
    <span class="col-prefix"></span>
    <span class="col-label">Représenté par</span>
    <span class="col-value">: <span class="dotted-line"></span></span>
  </div>
  <div class="parties-line">
    <span class="col-prefix">Et</span>
    <span class="col-label">${e(args.employeeRoleLabel)}</span>
    <span class="col-value">: <strong>${e(args.employeeName)}</strong></span>
  </div>
  <div class="parties-line">
    <span class="col-prefix"></span>
    <span class="col-label">NISS</span>
    <span class="col-value">: ${e(args.employeeNiss || "&hellip;")}</span>
  </div>
  <div class="parties-line">
    <span class="col-prefix"></span>
    <span class="col-label">Adresse</span>
    <span class="col-value">: ${e(args.employeeAddress || "&hellip;")}</span>
  </div>
  <div class="parties-line">
    <span class="col-prefix"></span>
    <span class="col-label">Localité</span>
    <span class="col-value">: ${e(args.employeeLocality || "&hellip;")}</span>
  </div>
</div>
<p class="convenu-line">IL EST CONVENU CE QUI SUIT :</p>
`.trim();
}

/**
 * Karim 2026-05-29 : construit le HTML complet du contrat pour DocuSeal.
 *
 * IMPORTANT : ne PAS modifier les attributs role/required/name/style des
 * <signature-field> et <date-field>. DocuSeal exige des INLINE styles
 * (width/height/display) sur chaque field pour qu il soit place dans le
 * PDF final (sinon la signature reste dans le certif separe au lieu d
 * apparaitre sur le contrat). Ref : https://www.docuseal.com/docs/embedded/html-builder
 */
function buildContractHtmlForDocuseal(args: {
  contractBodyHtml: string;
  employerName: string;
  employeeName: string;
  contractLocation: string;
  // Karim 2026-05-29 : si fourni, la signature employeur est INTEGREE dans le
  // PDF (image base64) au lieu d etre un champ a signer. Karim n a plus besoin
  // d intervenir, le contrat part directement a l employee deja signe.
  employerSignatureDataUrl?: string | null;
  employerRepresentativeName?: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const preSigned = !!args.employerSignatureDataUrl;

  // Bloc signature employeur : soit champ a signer, soit image deja apposee
  const employerSignatureBlock = preSigned
    ? `
        <img src="${args.employerSignatureDataUrl}" alt="Signature ${escapeHtml(args.employerName)}" style="display: block; max-width: 100%; max-height: 80px; margin: 0 auto 4px;">
        <div class="sig-date">Pré-signé par <strong>${escapeHtml(args.employerRepresentativeName ?? "")}</strong> le ${today}</div>`
    : `
        <signature-field name="Signature employeur" role="Employer" required="true" style="display: block; width: 100%; height: 80px; margin: 0 auto 4px;"></signature-field>
        <div class="sig-date">Date :
          <date-field name="Date employeur" role="Employer" required="true" style="display: inline-block; width: 110px; height: 20px;"></date-field>
        </div>`;

  // Date contrat : si pre-signe, on inscrit la date du jour directement
  const dateContrat = preSigned
    ? `<strong>${today}</strong>`
    : `<date-field name="Date contrat" role="Employer" required="true" default-value="${today}" style="display: inline-block; width: 130px; height: 22px;"></date-field>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Contrat - ${escapeHtml(args.employeeName)}</title>
<style>${CONTRACT_CSS}</style>
</head>
<body>
${args.contractBodyHtml}

<p class="closing-line">
  Fait en deux exemplaires à <strong>${escapeHtml(args.contractLocation)}</strong>, le ${dateContrat}.
  <br>Chacune des parties reconnaît avoir reçu un exemplaire original.
</p>

<div class="signatures">
  <div class="sig-row">
    <div class="sig-cell">
      <div class="sig-frame">
        <div class="sig-title">Signature du travailleur</div>
        <div class="sig-sub">(et parapher toutes les pages)</div>
        <signature-field name="Signature employee" role="Employee" required="true" style="display: block; width: 100%; height: 80px; margin: 0 auto 4px;"></signature-field>
        <div class="sig-date">Date :
          <date-field name="Date employee" role="Employee" required="true" style="display: inline-block; width: 110px; height: 20px;"></date-field>
        </div>
      </div>
    </div>
    <div class="sig-cell">
      <div class="sig-frame">
        <div class="sig-title">Signature de l'employeur ou de son délégué</div>
        <div class="sig-sub">${preSigned ? "(pré-signée numériquement)" : "(et parapher toutes les pages)"}</div>${employerSignatureBlock}
      </div>
    </div>
  </div>
</div>

<div class="footer-mentions">
  *Biffer la mention inutile &middot; ${escapeHtml(args.employerName)} &middot; Contrat soumis à la loi du 3 juillet 1978
</div>
</body>
</html>`;
}

/**
 * Cree un template DocuSeal a partir du markdown contractuel.
 */
export async function createDocusealTemplateFromContract(args: {
  templateCode: "employee" | "employee_pt" | "student";
  templateBodyMarkdown: string;
  employeeData: Parameters<typeof buildContractVariables>[0]["employee"];
  employerOrg: EmployerOrgKey;
  primarySite?: Parameters<typeof buildContractVariables>[0]["primarySite"];
  // Karim 2026-05-29 : signature stockee de l employeur. Si fournie, le PDF
  // est genere avec la signature deja apposee et l employee est le seul
  // signataire DocuSeal.
  employerSignatureDataUrl?: string | null;
}): Promise<{ ok: true; templateId: number; templateName: string } | { ok: false; error: string }> {
  const baseUrl = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, error: "DocuSeal non configure" };

  const vars = buildContractVariables({
    employee: args.employeeData,
    primarySite: args.primarySite,
    employerOrg: args.employerOrg,
  });
  const rendered = renderContractTemplate(args.templateBodyMarkdown, vars);
  // Karim 2026-05-29 : on supprime du markdown rendu le bloc d en-tete
  // "Entre / Et / IL EST CONVENU" car on le re-genere en HTML structure
  // (alignement parfait sur 3 colonnes comme dans les PDF originaux).
  // Le markdown templates contient des lignes "Entre" .. "IL EST CONVENU"
  // qu on detache pour les remplacer.
  const { bodyWithoutHeader, partiesBlock } = extractPartiesAndConvenu(rendered, args);
  const bodyHtml = partiesBlock + markdownToHtml(bodyWithoutHeader);

  const employerName = EMPLOYER_ORGS[args.employerOrg].name;
  const contractLocation = String(vars.contract_location ?? "Bruxelles");
  const fullHtml = buildContractHtmlForDocuseal({
    contractBodyHtml: bodyHtml,
    employerName,
    employeeName: args.employeeData.full_name,
    contractLocation,
    employerSignatureDataUrl: args.employerSignatureDataUrl,
    employerRepresentativeName: EMPLOYER_ORGS[args.employerOrg].representative,
  });

  const templateName = `${args.templateCode}_${args.employeeData.full_name.replace(/\s+/g, "_")}_${Date.now()}`;

  try {
    const res = await fetch(`${baseUrl}/templates/html`, {
      method: "POST",
      headers: {
        "X-Auth-Token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: templateName,
        html: fullHtml,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `DocuSeal /templates/html HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data = (await res.json()) as { id: number; name: string };
    return { ok: true, templateId: data.id, templateName: data.name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Karim 2026-05-29 : extrait l en-tete parties du markdown rendu pour le
 * remplacer par un bloc HTML structure (alignement 3 colonnes). On garde
 * uniquement le contenu APRES "IL EST CONVENU CE QUI SUIT :" pour la
 * conversion markdown.
 */
function extractPartiesAndConvenu(
  rendered: string,
  args: {
    templateCode: "employee" | "employee_pt" | "student";
    employeeData: Parameters<typeof buildContractVariables>[0]["employee"];
    employerOrg: EmployerOrgKey;
  },
): { bodyWithoutHeader: string; partiesBlock: string } {
  // Le markdown commence par "# CONTRAT ..." suivi du bloc parties.
  // On garde le titre `# ...` + on detache jusqu a "IL EST CONVENU ...".
  const lines = rendered.split(/\r?\n/);
  const titleLines: string[] = [];
  let i = 0;
  // Capture le titre (premiere ligne #)
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && /^#\s+/.test(lines[i])) {
    titleLines.push(lines[i]);
    i++;
  }
  // Skip jusqu a "IL EST CONVENU"
  let convenuIdx = -1;
  for (let j = i; j < lines.length; j++) {
    if (/IL EST CONVENU/i.test(lines[j])) {
      convenuIdx = j;
      break;
    }
  }
  // Karim 2026-05-29 : si on trouve pas le marqueur, fallback safe sur
  // tout le markdown (pas de skip d en-tete).
  if (convenuIdx === -1) {
    return { bodyWithoutHeader: rendered, partiesBlock: "" };
  }
  const bodyWithoutHeader = [
    ...titleLines,
    "",
    ...lines.slice(convenuIdx + 1),
  ].join("\n");

  // Construit le bloc parties en HTML
  const org = EMPLOYER_ORGS[args.employerOrg];
  const e = args.employeeData;
  // Format nom : "NOM Prenom" comme dans les PDF originaux
  const parts = (e.full_name ?? "").trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");
  const formattedName = lastName ? `${lastName.toUpperCase()} ${firstName}` : firstName.toUpperCase();
  const partiesBlock = buildPartiesBlockHtml({
    employerName: org.name,
    employerAddress: org.address,
    employerLocality: org.locality,
    employeeRoleLabel: args.templateCode === "student" ? "L'ouvrier" : "L'employé",
    employeeName: formattedName,
    employeeNiss: e.nrn ?? "",
    employeeAddress: e.address ?? "",
    employeeLocality: e.postal_code && e.city ? `${e.postal_code} ${e.city}` : (e.city ?? ""),
  });
  return { bodyWithoutHeader, partiesBlock };
}

/**
 * Cree une submission DocuSeal a partir d un template existant.
 * Envoie le mail de signature aux 2 signataires (employee + employer).
 */
// Karim 2026-05-29 : messages mail dans la langue de l employee.
const MAIL_MESSAGES = {
  fr: {
    subject: (org: string) => `Votre contrat de travail ${org} — à signer`,
    bodyPresigned: (employeeFirstName: string, employerName: string) =>
      `Bonjour ${employeeFirstName},\n\nNous vous souhaitons la bienvenue dans l'équipe ${employerName} !\n\nVeuillez trouver ci-joint votre contrat de travail, déjà signé par notre département RH. Il ne vous reste qu'à le signer électroniquement à votre tour en cliquant sur le lien ci-dessous.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement,\nL'équipe RH`,
    bodyDual: (employeeFirstName: string, employerName: string) =>
      `Bonjour ${employeeFirstName},\n\nBienvenue dans l'équipe ${employerName} ! Veuillez trouver ci-joint votre contrat de travail à signer électroniquement.\n\nCordialement,\nL'équipe RH`,
  },
  nl: {
    subject: (org: string) => `Uw arbeidsovereenkomst ${org} — te ondertekenen`,
    bodyPresigned: (employeeFirstName: string, employerName: string) =>
      `Beste ${employeeFirstName},\n\nWelkom bij het team van ${employerName}!\n\nHierbij vindt u uw arbeidsovereenkomst, reeds ondertekend door onze HR-afdeling. U hoeft hem enkel nog elektronisch te ondertekenen door op onderstaande link te klikken.\n\nAarzel niet om ons te contacteren bij vragen.\n\nMet vriendelijke groet,\nHet HR-team`,
    bodyDual: (employeeFirstName: string, employerName: string) =>
      `Beste ${employeeFirstName},\n\nWelkom bij het team van ${employerName}! Hierbij vindt u uw arbeidsovereenkomst die u elektronisch dient te ondertekenen.\n\nMet vriendelijke groet,\nHet HR-team`,
  },
  en: {
    subject: (org: string) => `Your employment contract ${org} — to be signed`,
    bodyPresigned: (employeeFirstName: string, employerName: string) =>
      `Hello ${employeeFirstName},\n\nWelcome to the ${employerName} team!\n\nPlease find your employment contract attached, already signed by our HR department. All that remains is for you to sign it electronically by clicking the link below.\n\nFeel free to contact us with any questions.\n\nBest regards,\nThe HR team`,
    bodyDual: (employeeFirstName: string, employerName: string) =>
      `Hello ${employeeFirstName},\n\nWelcome to the ${employerName} team! Please find your employment contract to be signed electronically.\n\nBest regards,\nThe HR team`,
  },
} as const;

export type ContractLang = keyof typeof MAIL_MESSAGES;

export async function createSubmissionForContract(args: {
  templateId: number;
  employeeName: string;
  employeeEmail: string;
  employerName: string;
  employerEmail: string;
  metadata?: Record<string, string>;
  // Karim 2026-05-29 :
  language?: ContractLang;
  preSigned?: boolean; // si true : 1 seul submitter (employee). Karim deja signe.
  replyTo?: string; // ex: hr@caftanfactory.com
}): Promise<{ ok: true; submissionId: number; signingUrls: Array<{ role: string; email: string; url?: string }> } | { ok: false; error: string }> {
  const baseUrl = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, error: "DocuSeal non configure" };

  const lang: ContractLang = args.language ?? "fr";
  const msg = MAIL_MESSAGES[lang];
  const firstName = args.employeeName.split(/\s+/)[0] ?? args.employeeName;
  const subject = msg.subject(args.employerName);
  const body = args.preSigned
    ? msg.bodyPresigned(firstName, args.employerName)
    : msg.bodyDual(firstName, args.employerName);

  // Submitters : si pre-signed -> uniquement employee. Sinon -> employer + employee.
  const submitters = args.preSigned
    ? [
        {
          role: "Employee",
          name: args.employeeName,
          email: args.employeeEmail,
          message: { subject, body },
        },
      ]
    : [
        {
          role: "Employer",
          name: args.employerName,
          email: args.employerEmail,
        },
        {
          role: "Employee",
          name: args.employeeName,
          email: args.employeeEmail,
          message: { subject, body },
        },
      ];

  try {
    // Karim 2026-05-29 : DocuSeal n envoie PAS le mail (send_email=false).
    // C est hr@caftanfactory.com qui envoie le mail via EmailJS depuis CaftanRH
    // avec le lien de signature embed_src de la submission.
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "X-Auth-Token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_id: args.templateId,
        send_email: false,
        order: "preserved",
        reply_to: args.replyTo,
        submitters,
        metadata: args.metadata,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `DocuSeal /submissions HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data = (await res.json()) as Array<{
      id: number;
      submission_id: number;
      role: string;
      email: string;
      embed_src?: string;
    }>;
    return {
      ok: true,
      submissionId: data[0]?.submission_id ?? 0,
      signingUrls: data.map((s) => ({ role: s.role, email: s.email, url: s.embed_src })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
