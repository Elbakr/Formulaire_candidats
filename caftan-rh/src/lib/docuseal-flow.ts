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
 * Karim 2026-05-29 (v4) : refonte CSS pixel-perfect apres analyse fine des
 * 3 PDF originaux du secretariat social belge (Sodibel / SD Worx) :
 *   - 003.00 FR - CT - employe (3 pages)
 *   - 004.00 FR - CT - employe temps partiel (4 pages, avec annexe horaires)
 *   - 006.00 FR - CT - occupation d etudiant (2 pages)
 *
 * Differences MAJEURES corrigees vs v3 :
 *  1. Titre principal ENCADRE par un rectangle noir (border 1pt). v3 n avait
 *     PAS d encadre. C est l element visuel le plus reconnaissable du PDF.
 *  2. Articles : "Article N." en GRAS + SOULIGNE (pas juste gras). v3 disait
 *     gras simple - erreur. Le PDF utilise text-decoration: underline.
 *  3. Bloc parties : 2 sous-labels "L'employeur" / "L'employé" en GRAS suivis
 *     de la valeur. v3 mettait tout sur une seule ligne, perdant la structure.
 *  4. Cadres signature : VRAIS rectangles bordures noires 1pt (PAS juste une
 *     ligne du bas). C est tres visible dans les PDF.
 *  5. Footer : "*Biffer la mention inutile" gauche + "Page X sur Y" DROITE,
 *     sur la meme ligne. v3 n avait pas le "Page X sur Y".
 *  6. Article 10 : retrait + puce carre noir (▪) selon style PDF original.
 *  7. Mentions italiques discretes (8.5pt) sous les articles : "Hormis...",
 *     "La partie qui met fin...", "Preciser les eventuels...".
 *  8. Police : Calibri 10pt corps, 14pt titre, 8pt footer, 9pt mentions ital.
 *  9. Cases a cocher ☐ et ☒ : caracteres unicode (font "Segoe UI Symbol" fallback).
 * 10. Sauts de page calcules : signature TOUJOURS sur derniere page (page-break).
 */
const CONTRACT_CSS = `
  @page {
    size: A4 portrait;
    margin: 1.8cm 1.8cm 1.5cm 1.8cm;
    /* Footer "Biffer la mention inutile" + "Page X sur Y" via paged media */
    @bottom-left {
      content: "*Biffer la mention inutile";
      font-family: 'Calibri', 'Carlito', 'Arial', sans-serif;
      font-size: 8pt;
      color: #000;
    }
    @bottom-right {
      content: "Page " counter(page) " sur " counter(pages);
      font-family: 'Calibri', 'Carlito', 'Arial', sans-serif;
      font-size: 8pt;
      color: #000;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Calibri', 'Carlito', 'Arial', 'Helvetica', sans-serif;
    font-size: 10pt;
    line-height: 1.3;
    color: #000;
    background: #fff;
  }
  /* Titre principal : ENCADRE par un rectangle noir 1pt comme dans le PDF
     d origine. Centre, MAJUSCULES, GRAS, ~16pt. */
  .doc-title {
    margin: 0 0 0.7cm 0;
    text-align: center;
    page-break-after: avoid;
    border: 1pt solid #000;
    padding: 0.35cm 0.3cm;
  }
  .doc-title h1 {
    margin: 0;
    font-family: 'Calibri', 'Carlito', 'Arial', sans-serif;
    font-size: 16pt;
    font-weight: bold;
    letter-spacing: 0;
    text-transform: uppercase;
    color: #000;
    line-height: 1.1;
  }
  /* Sous-titre informatif sous le titre (ex: mention etudiant) */
  .doc-subtitle {
    text-align: center;
    font-size: 9.5pt;
    font-style: italic;
    font-weight: bold;
    margin: 0 0 0.5cm 0;
    line-height: 1.3;
    color: #000;
    padding: 0 1cm;
  }
  .doc-title-annexe { margin-top: 0.5cm; }
  .doc-title-annexe h2 {
    margin: 0;
    font-size: 16pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0;
    color: #000;
    line-height: 1.1;
  }
  /* Bloc "Entre / Et" : structure tableau aligne 4 colonnes */
  .parties-block {
    margin: 0.3cm 0 0.4cm 0;
    page-break-inside: avoid;
    font-size: 10pt;
  }
  .parties-block table {
    width: 100%;
    border-collapse: collapse;
  }
  .parties-block td {
    padding: 0.05cm 0;
    vertical-align: top;
  }
  .parties-block .col-prefix {
    width: 1.5cm;
    font-weight: bold;
  }
  .parties-block .col-label {
    width: 3.2cm;
    font-weight: bold;
  }
  .parties-block .col-sep {
    width: 0.3cm;
  }
  .parties-block .col-value {
    font-weight: normal;
  }
  /* Ligne pointillee pour champ vide */
  .dotted-fill {
    display: inline-block;
    width: 100%;
    border-bottom: 1pt dotted #000;
    height: 0.9em;
    vertical-align: bottom;
  }
  /* "IL EST CONVENU CE QUI SUIT :" : en GRAS dans le PDF original */
  .convenu-line {
    font-weight: bold;
    margin: 0.7cm 0 0.5cm 0;
    font-size: 10pt;
  }
  /* Headers d articles : GRAS + SOULIGNE, c est la signature visuelle des
     PDF du secretariat social belge */
  h2.article-head {
    font-size: 10pt;
    font-weight: bold;
    text-decoration: underline;
    margin: 0.4cm 0 0.15cm 0;
    page-break-after: avoid;
    color: #000;
  }
  h2.section-head {
    font-size: 10pt;
    font-weight: bold;
    text-decoration: underline;
    margin: 0.4cm 0 0.15cm 0;
    color: #000;
  }
  h3.subsection-head {
    font-size: 10pt;
    font-weight: bold;
    text-decoration: underline;
    margin: 0.3cm 0 0.1cm 0;
    color: #000;
  }
  p {
    margin: 0.05cm 0 0.15cm 0;
    text-align: left;
  }
  /* Listes a tirets / puces : utilisation d un carre noir ▪ comme article 10
     du PDF original (style Word "wingdings square") */
  ul.md-list {
    margin: 0.15cm 0 0.2cm 0.6cm;
    padding-left: 0.4cm;
    list-style-type: none;
  }
  ul.md-list li {
    margin-bottom: 0.12cm;
    padding-left: 0.5cm;
    position: relative;
  }
  ul.md-list li::before {
    content: "\\25AA"; /* unicode small black square ▪ */
    position: absolute;
    left: 0;
    top: 0;
    font-size: 9pt;
  }
  /* Separateur horizontal markdown --- */
  hr.md-sep {
    border: 0;
    border-top: 0;
    margin: 0.5cm 0;
    height: 0;
    page-break-after: always; /* saut de page entre contrat et annexe */
  }
  /* Tables markdown (preavis etudiant, schema horaire, etc.) :
     bordures fines noires, en-tetes gras centres */
  table.md-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.25cm 0 0.2cm 0;
    font-size: 9.5pt;
  }
  table.md-table th,
  table.md-table td {
    border: 1pt solid #000;
    padding: 0.15cm 0.2cm;
    text-align: center;
    vertical-align: middle;
  }
  table.md-table th {
    background: #fff;
    font-weight: bold;
  }
  /* Bloc signature : 2 cadres ENCADRES cote a cote, style strict du PDF */
  .signatures {
    margin-top: 0.6cm;
    display: table;
    width: 100%;
    table-layout: fixed;
    page-break-inside: avoid;
    border-spacing: 0.4cm 0;
    margin-left: -0.2cm;
    margin-right: -0.2cm;
  }
  .signatures .sig-row { display: table-row; }
  .signatures .sig-cell {
    display: table-cell;
    width: 50%;
    vertical-align: top;
    padding: 0;
  }
  .signatures .sig-box {
    border: 1pt solid #000;
    padding: 0.2cm 0.3cm;
    min-height: 4cm;
  }
  .signatures .sig-title {
    font-size: 9.5pt;
    font-weight: normal;
    text-align: center;
    margin-bottom: 0.05cm;
    color: #000;
  }
  .signatures .sig-sub {
    font-size: 9pt;
    font-style: italic;
    text-align: center;
    color: #000;
    margin-bottom: 0.3cm;
  }
  .signatures .sig-zone {
    min-height: 2.5cm;
    margin: 0.15cm 0;
    text-align: center;
  }
  .signatures .sig-date {
    font-size: 9pt;
    color: #000;
    margin-top: 0.15cm;
    text-align: left;
  }
  /* Co-signataire (Kamal) : note italique sous le cadre principal */
  .co-rep-note {
    font-size: 8.5pt;
    font-style: italic;
    text-align: center;
    color: #000;
    margin-top: 0.15cm;
  }
  /* "Fait en deux exemplaires a ... le ..." : taille corps, marge moderee */
  .closing-line {
    margin-top: 0.7cm;
    font-size: 10pt;
    line-height: 1.3;
  }
  .closing-line strong { font-weight: bold; }
  /* Mentions italiques (commentaires legaux 9pt) */
  p em {
    font-style: italic;
    font-size: 9pt;
  }
  /* Inline strong */
  strong { font-weight: bold; }
  /* Bloc article 10 a puces : retrait normal sans li::marker affichage */
  /* Styles imprimables (DocuSeal convertit HTML -> PDF cote serveur) */
  @media print {
    body { padding: 0; margin: 0; }
    .signatures { page-break-inside: avoid; }
    h2.article-head { page-break-after: avoid; }
    .doc-title { page-break-after: avoid; }
    .parties-block { page-break-inside: avoid; }
  }
`;

/**
 * Karim 2026-05-29 (v4) : construit le bloc "Entre / Et" (parties au contrat)
 * en HTML structure tableau, alignement strict des 4 colonnes selon le PDF :
 *   col 1 : "Entre" / "Et" (prefix gras)
 *   col 2 : "L'employeur", "Adresse", "Localité", "Représenté par",
 *           "L'employé", "NISS", "Adresse", "Localité" (label gras)
 *   col 3 : ":"
 *   col 4 : valeur (employeur en gras, le reste normal)
 *
 * "Représenté par" est PRE-REMPLI avec le representant Karim, et si un
 * co-representant Kamal existe, une 2e ligne s ajoute.
 */
function buildPartiesBlockHtml(args: {
  employerName: string;
  employerAddress: string;
  employerLocality: string;
  employerRepresentative: string;
  employerCoRepresentative?: string;
  employeeRoleLabel: string; // "L'employé", "L'ouvrier" (etudiant)
  employeeName: string;
  employeeNiss: string;
  employeeAddress: string;
  employeeLocality: string;
}): string {
  const e = (s: string) => escapeHtml(s);
  // Helper : valeur ou ligne pointillee si vide (style PDF original)
  const v = (val: string) => val
    ? e(val)
    : `<span class="dotted-fill"></span>`;
  // Karim 2026-05-29 : si Kamal est defini, on liste les 2 representants
  // separes par "ou" (signature alternative possible).
  const repText = args.employerCoRepresentative && args.employerCoRepresentative.trim() !== ""
    ? `${e(args.employerRepresentative)} <em>ou</em> ${e(args.employerCoRepresentative)} <em>(à signer si nécessaire)</em>`
    : e(args.employerRepresentative);
  return `
<div class="parties-block">
  <table>
    <tr>
      <td class="col-prefix">Entre</td>
      <td class="col-label">L'employeur</td>
      <td class="col-sep">:</td>
      <td class="col-value"><strong>${e(args.employerName)}</strong></td>
    </tr>
    <tr>
      <td class="col-prefix"></td>
      <td class="col-label">Adresse</td>
      <td class="col-sep">:</td>
      <td class="col-value">${v(args.employerAddress)}</td>
    </tr>
    <tr>
      <td class="col-prefix"></td>
      <td class="col-label">Localité</td>
      <td class="col-sep">:</td>
      <td class="col-value">${v(args.employerLocality)}</td>
    </tr>
    <tr>
      <td class="col-prefix"></td>
      <td class="col-label">Représenté par</td>
      <td class="col-sep">:</td>
      <td class="col-value">${repText}</td>
    </tr>
    <tr>
      <td class="col-prefix">Et</td>
      <td class="col-label">${e(args.employeeRoleLabel)}</td>
      <td class="col-sep">:</td>
      <td class="col-value"><strong>${e(args.employeeName)}</strong></td>
    </tr>
    <tr>
      <td class="col-prefix"></td>
      <td class="col-label">NISS</td>
      <td class="col-sep">:</td>
      <td class="col-value">${v(args.employeeNiss)}</td>
    </tr>
    <tr>
      <td class="col-prefix"></td>
      <td class="col-label">Adresse</td>
      <td class="col-sep">:</td>
      <td class="col-value">${v(args.employeeAddress)}</td>
    </tr>
    <tr>
      <td class="col-prefix"></td>
      <td class="col-label">Localité</td>
      <td class="col-sep">:</td>
      <td class="col-value">${v(args.employeeLocality)}</td>
    </tr>
  </table>
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
  employerCoRepresentativeName?: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const preSigned = !!args.employerSignatureDataUrl;

  // Karim 2026-05-29 (v4) : bloc signature employeur dans un CADRE BORDURE
  // (style PDF original) avec titre centre au-dessus + sous-titre italique
  // "(et parapher...)". Si Kamal est defini, note italique "ou Kamal..." en
  // dessous du cadre (signature alternative).
  const coRepNote = args.employerCoRepresentativeName
    ? `<div class="co-rep-note">ou <strong>${escapeHtml(args.employerCoRepresentativeName)}</strong> (à signer si nécessaire)</div>`
    : "";

  const employerSignatureBlock = preSigned
    ? `<div class="sig-zone"><img src="${args.employerSignatureDataUrl}" alt="Signature ${escapeHtml(args.employerName)}" style="display: block; max-width: 100%; max-height: 80px; margin: 0 auto;"></div>
       <div class="sig-date">Pré-signé par <strong>${escapeHtml(args.employerRepresentativeName ?? "")}</strong> le ${today}</div>`
    : `<div class="sig-zone"><signature-field name="Signature employeur" role="Employer" required="true" style="display: block; width: 100%; height: 80px; margin: 0 auto;"></signature-field></div>
       <div class="sig-date">Date : <date-field name="Date employeur" role="Employer" required="true" style="display: inline-block; width: 110px; height: 18px;"></date-field></div>`;

  // Date contrat : si pre-signe, on inscrit la date du jour directement
  const dateContrat = preSigned
    ? `<strong>${today}</strong>`
    : `<date-field name="Date contrat" role="Employer" required="true" default-value="${today}" style="display: inline-block; width: 130px; height: 20px;"></date-field>`;

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
Fait en deux exemplaires à <strong>${escapeHtml(args.contractLocation)}</strong>, le ${dateContrat}.<br>
Chacune des parties reconnaît avoir reçu un exemplaire original.
</p>

<div class="signatures">
  <div class="sig-row">
    <div class="sig-cell">
      <div class="sig-box">
        <div class="sig-title">Signature du travailleur</div>
        <div class="sig-sub">(et parapher toutes les pages)</div>
        <div class="sig-zone"><signature-field name="Signature employee" role="Employee" required="true" style="display: block; width: 100%; height: 80px; margin: 0 auto;"></signature-field></div>
        <div class="sig-date">Date : <date-field name="Date employee" role="Employee" required="true" style="display: inline-block; width: 110px; height: 18px;"></date-field></div>
      </div>
    </div>
    <div class="sig-cell">
      <div class="sig-box">
        <div class="sig-title">Signature de l'employeur ou de son délégué</div>
        <div class="sig-sub">${preSigned ? "(pré-signée numériquement)" : "(et parapher toutes les pages)"}</div>
        ${employerSignatureBlock}
      </div>
      ${coRepNote}
    </div>
  </div>
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

  const org = EMPLOYER_ORGS[args.employerOrg];
  const employerName = org.name;
  const contractLocation = String(vars.contract_location ?? "Bruxelles");
  const fullHtml = buildContractHtmlForDocuseal({
    contractBodyHtml: bodyHtml,
    employerName,
    employeeName: args.employeeData.full_name,
    contractLocation,
    employerSignatureDataUrl: args.employerSignatureDataUrl,
    employerRepresentativeName: org.representative,
    employerCoRepresentativeName: org.co_representative,
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
    employerRepresentative: org.representative,
    employerCoRepresentative: org.co_representative,
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
