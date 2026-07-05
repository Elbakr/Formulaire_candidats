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

import { renderContractTemplate, buildContractVariables, EMPLOYER_ORGS, type EmployerOrgKey, type EmployerOrg } from "@/lib/contract-renderer";

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
  // Karim 2026-05-30 : wrapper chaque article (h2.article-head + paragraphes
  // suivants) dans <section class="article-block"> avec page-break-inside: avoid.
  // Garantit qu un article qui commence sur une page y finit (pas a cheval).
  return wrapArticlesInSections(out.join("\n"));
}

/**
 * Karim 2026-05-30 : post-process - wrap chaque article-head + ses paragraphes
 * suivants dans une <section class="article-block">. Le CSS applique alors
 * page-break-inside: avoid pour qu'un article ne soit jamais coupe en 2.
 */
function wrapArticlesInSections(html: string): string {
  const ARTICLE_RE = /<h2 class="article-head">/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const indexes: number[] = [];
  while ((match = ARTICLE_RE.exec(html)) !== null) {
    indexes.push(match.index);
  }
  if (indexes.length === 0) return html;
  parts.push(html.slice(0, indexes[0]));
  for (let k = 0; k < indexes.length; k++) {
    const start = indexes[k];
    const end = k + 1 < indexes.length ? indexes[k + 1] : html.length;
    const block = html.slice(start, end);
    // Karim 2026-05-31 : extract numero d'article pour data-article attribute
    // (utilisé par CSS body.contract-student section[data-article="9"]
    // page-break-before:always pour forcer Article 9 en haut de page 2)
    const numMatch = block.match(/<h2 class="article-head">[^<]*?Article\s+(\d+)/i);
    const articleAttr = numMatch ? ` data-article="${numMatch[1]}"` : "";
    parts.push(`<section class="article-block"${articleAttr}>${block}</section>`);
  }
  return parts.join("\n");
}

/**
 * Karim 2026-05-29 (v8) : reproduction PIXEL-PERFECT des PDF originaux SD Worx
 * apres analyse visuelle directe des 3 modeles :
 *   - 003.00 FR - CT - employe (3 pages, plein temps)
 *   - 004.00 FR - CT - employe temps partiel (4 pages, avec annexe)
 *   - 006.00 FR - CT - occupation d etudiant (2 pages)
 *
 * Mesures observees sur les originaux (proportions calculees vs hauteur page A4 = 29.7cm) :
 *  - Police : Calibri (defauts Word/SD Worx), corps 10pt, line-height ~1.25
 *  - Titre : ~18pt MAJUSCULES gras, dans rectangle bordure 0.5pt, hauteur ~1.3cm
 *           padding interne vertical ~0.4cm, largeur pleine (marges page)
 *  - Marges page : ~2cm top, 1.8cm bas, 2.5cm gauche/droite (typique Word)
 *  - Espace TITRE -> "Entre" : large ~1.5cm (saut visuel important)
 *  - Bloc Entre/Et : "Entre" gras col ~1.5cm, "L'employeur" gras col ~2.5cm,
 *    ":" col 0.3cm, valeur reste. Padding vertical ligne 0.04cm (tres serre)
 *  - Espace bloc parties -> "IL EST CONVENU" : ~1cm (saut net)
 *  - "IL EST CONVENU CE QUI SUIT :" en gras 10pt
 *  - Espace -> Article 1 : ~0.8cm
 *  - Articles : "Article N." SOULIGNE + GRAS 10pt sur sa propre ligne
 *    (pas inline avec le corps !), corps de l article en dessous
 *  - Espace inter-articles : ~0.5cm
 *  - Mentions italiques (Hormis.../La partie.../Preciser...) : 8.5pt italique
 *  - Cases a cocher ☐ : Calibri/Arial unicode 10pt, indentation ~1cm
 *  - Tableaux : bordure 0.5pt noir, padding cellule 0.1cm, en-tetes gras centres
 *  - "Fait en deux exemplaires..." : 10pt non gras (sauf lieu) avec saut visuel ~0.8cm
 *  - Cadres signature : 2 rectangles 50/50 separes par gap ~0.5cm,
 *    bordure 0.5pt, hauteur ~3.5cm, padding interne 0.2cm,
 *    titre "Signature du travailleur" centre 10pt non gras + sous-titre italique 9pt
 *  - Footer : "*Biffer la mention inutile" gauche italique 8pt
 *           "Page N sur M" droite, N et M en GRAS 8pt
 */
// Karim 2026-05-30 v3 : police 10pt + compensation marges
// Karim 2026-05-31 : force Article 9 sur page 2 via attribut data-article
// (cf wrapArticlesInSections qui parse le numero d'article).
const STUDENT_COMPACT_OVERRIDE = `
  @page {
    /* Karim 2026-05-30 : marges page legerement reduites pour student uniquement */
    margin: 1.5cm 1.8cm 1.3cm 1.8cm;
  }
  body.contract-student {
    font-size: 10pt;
    line-height: 1.2;
  }
  body.contract-student .doc-title h1 { font-size: 17pt; }
  body.contract-student .doc-title { margin-bottom: 0.35cm; padding: 0.2cm 0.4cm; }
  body.contract-student .parties-block { margin-bottom: 0.3cm; }
  body.contract-student .parties-block td { line-height: 1.2; }
  body.contract-student h2.article-head { margin: 0.25cm 0 0.06cm 0; }
  body.contract-student p { margin: 0 0 0.06cm 0; }
  body.contract-student .convenu-line { margin: 0 0 0.3cm 0; }
  body.contract-student .closing-line { margin-top: 0.35cm; }
  body.contract-student .signatures { margin-top: 0.35cm; }
  body.contract-student .sig-box { min-height: 2cm; padding: 0.12cm 0.25cm; }
  body.contract-student .sig-zone { min-height: 1.1cm; }
  /* Karim 2026-05-31 task #70 : force Article 9 en haut de page 2 */
  body.contract-student section.article-block[data-article="9"] {
    page-break-before: always;
    break-before: page;
  }
`;

// Karim 2026-07-05 : même compaction ÉPROUVÉE (celle de l'étudiant) appliquée au
// contrat EMPLOYÉ temps plein ET temps partiel — avant, ils n'avaient AUCUN
// resserrement -> 4 pages avec les 2 cadres de signature seuls sur la page 4.
// Le sélecteur [class^="contract-employee"] couvre 'contract-employee' (plein) et
// 'contract-employee_pt' (partiel). Pas de saut Article 9 (propre à l'étudiant).
const EMPLOYEE_COMPACT_OVERRIDE = `
  @page {
    margin: 1.5cm 1.8cm 1.3cm 1.8cm;
  }
  body[class^="contract-employee"] {
    font-size: 10pt;
    line-height: 1.2;
  }
  body[class^="contract-employee"] .doc-title h1 { font-size: 17pt; }
  body[class^="contract-employee"] .doc-title { margin-bottom: 0.35cm; padding: 0.2cm 0.4cm; }
  body[class^="contract-employee"] .parties-block { margin-bottom: 0.3cm; }
  body[class^="contract-employee"] .parties-block td { line-height: 1.2; }
  body[class^="contract-employee"] h2.article-head { margin: 0.25cm 0 0.06cm 0; }
  body[class^="contract-employee"] p { margin: 0 0 0.06cm 0; }
  body[class^="contract-employee"] .convenu-line { margin: 0 0 0.3cm 0; }
  body[class^="contract-employee"] .closing-line { margin-top: 0.35cm; }
  body[class^="contract-employee"] .signatures { margin-top: 0.35cm; }
  body[class^="contract-employee"] .sig-box { min-height: 2cm; padding: 0.12cm 0.25cm; }
  body[class^="contract-employee"] .sig-zone { min-height: 1.1cm; }
`;

// Karim 2026-06-17 : exporté pour réutilisation par la convention de rupture
// (même « Super Layout » : Calibri/A4, titre encadré, bloc parties, cases signature).
export const CONTRACT_CSS = `
  @page {
    size: A4 portrait;
    /* Karim v8 : marges proches des originaux SD Worx */
    margin: 1.8cm 2cm 1.6cm 2cm;
    /* Karim 2026-05-30 : contrat signe electroniquement = pas de mention biffer */
    @bottom-right {
      content: "Page " counter(page) " sur " counter(pages);
      font-family: 'Calibri', 'Carlito', 'Arial', sans-serif;
      font-size: 8pt;
      color: #000;
      vertical-align: top;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Calibri', 'Carlito', 'Arial', 'Helvetica', sans-serif;
    font-size: 10pt;
    line-height: 1.25;
    color: #000;
    background: #fff;
  }
  /* Karim v8 : TITRE en rectangle large bordure 0.5pt, ~1.3cm de haut */
  /* Karim 2026-05-30 REVERT v8.1 : 0.7cm (v8.2 cassait Article 5) */
  .doc-title {
    margin: 0 0 0.7cm 0;
    text-align: center;
    page-break-after: avoid;
    border: 0.5pt solid #000;
    padding: 0.3cm 0.4cm;
  }
  .doc-title h1 {
    margin: 0;
    font-family: 'Calibri', 'Carlito', 'Arial', sans-serif;
    font-size: 18pt;
    font-weight: bold;
    letter-spacing: 0;
    text-transform: uppercase;
    color: #000;
    line-height: 1.1;
  }
  /* Sous-titre etudiant : italique gras centre sous le titre */
  .doc-subtitle {
    text-align: center;
    font-size: 10pt;
    font-style: italic;
    font-weight: bold;
    margin: -0.9cm 0 1cm 0;
    line-height: 1.3;
    color: #000;
    padding: 0 1cm;
  }
  .doc-title-annexe { margin-top: 0; margin-bottom: 1cm; }
  .doc-title-annexe h2 {
    margin: 0;
    font-size: 18pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0;
    color: #000;
    line-height: 1.1;
  }
  /* Bloc "Entre / Et" : alignement 4 colonnes type tableau */
  /* Karim 2026-05-30 REVERT v8.1 : 0.6cm */
  .parties-block {
    margin: 0 0 0.6cm 0;
    page-break-inside: avoid;
    font-size: 10pt;
  }
  .parties-block table {
    width: 100%;
    /* Karim 2026-05-30 : separate + spacing horizontal pour aerer entre cellules
       (Entre / L employeur / : / AMD MEGASTORE) sans bouger la pagination */
    border-collapse: separate;
    border-spacing: 0.15cm 0;
  }
  .parties-block td {
    padding: 0.02cm 0;
    vertical-align: top;
    line-height: 1.25;
  }
  .parties-block .col-prefix {
    width: 1.5cm;
    font-weight: bold;
    padding-left: 0.3cm;
  }
  .parties-block .col-label {
    width: 2.6cm;
    font-weight: bold;
  }
  .parties-block .col-sep {
    width: 0.25cm;
  }
  .parties-block .col-value {
    font-weight: normal;
  }
  /* Ligne pointillee pour champ vide (s etend a 100% de la cellule) */
  .dotted-fill {
    display: inline-block;
    width: 100%;
    border-bottom: 0;
    height: 0.85em;
    vertical-align: bottom;
    overflow: hidden;
    letter-spacing: 0.05em;
  }
  .dotted-fill::after {
    content: "..........................................................................................................................................................................................................";
    color: #000;
    font-size: 10pt;
    letter-spacing: 0;
  }
  /* "IL EST CONVENU CE QUI SUIT :" : gras 10pt, espace large dessous */
  .convenu-line {
    font-weight: bold;
    margin: 0 0 0.8cm 0;
    font-size: 10pt;
  }
  /* Karim 2026-05-30 : chaque article wrapper -> ne peut pas etre coupe en 2 pages */
  .article-block {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  /* Karim v8 : articles "Article N." SOULIGNE + GRAS sur sa propre ligne */
  /* Karim 2026-05-30 REVERT v8.1 : 0.4/0.1 (v8.2 cassait Article 5) */
  h2.article-head {
    font-size: 10pt;
    font-weight: bold;
    text-decoration: underline;
    margin: 0.4cm 0 0.1cm 0;
    page-break-after: avoid;
    color: #000;
    display: block;
  }
  h2.section-head {
    font-size: 10pt;
    font-weight: bold;
    text-decoration: underline;
    margin: 0.5cm 0 0.15cm 0;
    color: #000;
  }
  h3.subsection-head {
    font-size: 10pt;
    font-weight: bold;
    text-decoration: none;
    margin: 0.3cm 0 0.1cm 0;
    color: #000;
  }
  /* Karim 2026-05-30 REVERT v8.1 : 0.12 (v8.2 cassait Article 5) */
  p {
    margin: 0 0 0.12cm 0;
    text-align: left;
  }
  /* Listes a puces carre noir (article 10) */
  ul.md-list {
    margin: 0.15cm 0 0.2cm 1.2cm;
    padding-left: 0.4cm;
    list-style-type: none;
  }
  ul.md-list li {
    margin-bottom: 0.18cm;
    padding-left: 0.5cm;
    position: relative;
    line-height: 1.3;
  }
  ul.md-list li::before {
    content: "\\25AA";
    position: absolute;
    left: 0;
    top: 0;
    font-size: 10pt;
  }
  /* Separateur horizontal markdown --- (juste un espace visuel) */
  hr.md-sep {
    border: 0;
    margin: 0.3cm 0;
    height: 0;
  }
  /* Tables markdown (preavis etudiant, schema horaire) :
     bordure fine 0.5pt noir, padding cellule 0.1cm */
  table.md-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.3cm 0 0.3cm 0;
    font-size: 10pt;
  }
  table.md-table th,
  table.md-table td {
    border: 0.5pt solid #000;
    padding: 0.12cm 0.2cm;
    text-align: center;
    vertical-align: middle;
  }
  table.md-table th {
    background: #fff;
    font-weight: bold;
  }
  /* Bloc signature : 2 cadres separes par gap ~0.5cm */
  /* Karim 2026-05-30 REVERT v8.1 : margin-top 0.7cm */
  .signatures {
    margin-top: 0.7cm;
    display: table;
    width: 100%;
    table-layout: fixed;
    page-break-inside: avoid;
    border-spacing: 0.5cm 0;
    margin-left: -0.25cm;
    margin-right: -0.25cm;
  }
  /* Karim 2026-05-30 : hack table pour forcer hauteur identique des 2 cellules
     (sinon le sig-box employeur pre-signe deborde par rapport a employee) */
  .signatures .sig-row { display: table-row; height: 1px; }
  .signatures .sig-cell {
    display: table-cell;
    width: 50%;
    vertical-align: top;
    padding: 0;
    height: 100%;
  }
  /* Karim 2026-05-30 : encadré signature reduit (3.5cm -> 2.5cm) + height 100% symetrie */
  .signatures .sig-box {
    border: 0.5pt solid #000;
    padding: 0.15cm 0.25cm;
    min-height: 2.5cm;
    height: 100%;
    box-sizing: border-box;
  }
  .signatures .sig-title {
    font-size: 10pt;
    font-weight: normal;
    text-align: center;
    margin: 0;
    color: #000;
    line-height: 1.3;
  }
  .signatures .sig-sub {
    font-size: 9pt;
    font-style: italic;
    text-align: center;
    color: #000;
    margin: 0 0 0.15cm 0;
    line-height: 1.3;
  }
  /* Karim 2026-05-30 : zone signature reduite (1.8cm -> 1.4cm) */
  .signatures .sig-zone {
    min-height: 1.4cm;
    margin: 0.05cm 0;
    text-align: center;
  }
  .signatures .sig-date {
    font-size: 9pt;
    color: #000;
    margin-top: 0.1cm;
    text-align: left;
  }
  .co-rep-note {
    font-size: 9pt;
    font-style: italic;
    text-align: center;
    color: #000;
    margin-top: 0.1cm;
  }
  /* "Fait en deux exemplaires a ... le ..." : 10pt avec marge top large */
  /* Karim 2026-05-30 REVERT v8.1 : margin-top 0.7cm */
  .closing-line {
    margin-top: 0.7cm;
    margin-bottom: 0;
    font-size: 10pt;
    line-height: 1.3;
  }
  .closing-line strong { font-weight: bold; }
  /* Mentions italiques (Hormis... / La partie... / Preciser...) : 8.5pt italique */
  p em {
    font-style: italic;
    font-size: 8.5pt;
  }
  strong { font-weight: bold; }
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
  employeeRoleLabel: string; // toujours "L'employé" (Karim 2026-05-30)
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
  // Karim 2026-05-30 : UN SEUL representant (l admin/rh connecte qui envoie).
  // Jamais "Karim ou Kamal" - choix fait a l envoi selon qui est present.
  const repText = e(args.employerRepresentative);
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
  // Karim 2026-05-30 : permet override CSS par type de contrat (ex: student
  // legerement compact pour tenir en 2 pages au lieu de 3, sans toucher au
  // layout des autres templates)
  templateCode?: "employee" | "employee_pt" | "student";
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

  // Karim 2026-05-30 : UN SEUL representant - pas de note "ou Kamal" sous la signature
  const coRepNote = "";

  // Karim 2026-05-30 : date retiree (déjà stipulée dans la closing-line "Fait... le DD-MM-YYYY")
  const employerSignatureBlock = preSigned
    ? `<div class="sig-zone"><img src="${args.employerSignatureDataUrl}" alt="Signature ${escapeHtml(args.employerName)}" style="display: block; max-width: 100%; max-height: 50px; margin: 0 auto;"></div>`
    : `<div class="sig-zone"><signature-field name="Signature employeur" role="Employer" required="true" style="display: block; width: 100%; height: 50px; margin: 0 auto;"></signature-field></div>`;

  // Date contrat : si pre-signe, on inscrit la date du jour directement
  const dateContrat = preSigned
    ? `<strong>${today}</strong>`
    : `<date-field name="Date contrat" role="Employer" required="true" default-value="${today}" style="display: inline-block; width: 130px; height: 20px;"></date-field>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Contrat - ${escapeHtml(args.employeeName)}</title>
<style>${CONTRACT_CSS}${args.templateCode === "student" ? STUDENT_COMPACT_OVERRIDE : EMPLOYEE_COMPACT_OVERRIDE}</style>
</head>
<body class="contract-${args.templateCode ?? "employee"}">
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
        <div class="sig-zone"><signature-field name="Signature employee" role="Employee" required="true" style="display: block; width: 100%; height: 50px; margin: 0 auto;"></signature-field></div>
      </div>
    </div>
    <div class="sig-cell">
      <div class="sig-box">
        <div class="sig-title">Signature de l'employeur ou de son délégué</div>
        ${preSigned ? `<div class="sig-sub">(pré-signée numériquement)</div>` : ""}
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
 * Karim 2026-05-30 : retourne juste le HTML rendu (zero appel DocuSeal externe)
 * pour preview iframe. Reutilise toute la logique de rendu : markdown ->
 * parties block -> articles -> CSS pixel-perfect.
 */
export async function buildContractHtmlForDocuseal_publicForPreview(args: {
  templateCode: "employee" | "employee_pt" | "student";
  templateBodyMarkdown: string;
  employeeData: Parameters<typeof buildContractVariables>[0]["employee"];
  employerOrg: EmployerOrgKey;
  // Karim 2026-06-18 : entité depuis la table employer_orgs (éditable). Prime.
  employerData?: EmployerOrg;
  primarySite?: Parameters<typeof buildContractVariables>[0]["primarySite"];
  employerSignatureDataUrl?: string | null;
  employerRepresentativeOverride?: string;
}): Promise<string> {
  const vars = buildContractVariables({
    employee: args.employeeData,
    primarySite: args.primarySite,
    employerOrg: args.employerOrg,
    employerData: args.employerData,
  });
  const rendered = renderContractTemplate(args.templateBodyMarkdown, vars);
  const { bodyWithoutHeader, partiesBlock } = extractPartiesAndConvenu(rendered, {
    templateCode: args.templateCode,
    employeeData: args.employeeData,
    employerOrg: args.employerOrg,
    employerData: args.employerData,
    employerRepresentativeOverride: args.employerRepresentativeOverride,
  });
  const bodyHtmlFull = markdownToHtml(bodyWithoutHeader);
  const titleEndMatch = bodyHtmlFull.match(/<div class="doc-title">[\s\S]*?<\/div>/);
  const bodyHtml = titleEndMatch
    ? bodyHtmlFull.slice(0, titleEndMatch.index! + titleEndMatch[0].length)
      + partiesBlock
      + bodyHtmlFull.slice(titleEndMatch.index! + titleEndMatch[0].length)
    : partiesBlock + bodyHtmlFull;
  const org = args.employerData ?? EMPLOYER_ORGS[args.employerOrg];
  return buildContractHtmlForDocuseal({
    contractBodyHtml: bodyHtml,
    templateCode: args.templateCode,
    employerName: org.name,
    employeeName: args.employeeData.full_name,
    contractLocation: String(vars.contract_location ?? "Bruxelles"),
    employerSignatureDataUrl: args.employerSignatureDataUrl,
    employerRepresentativeName: args.employerRepresentativeOverride ?? org.representative,
  });
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
  // Karim 2026-05-30 : nom du representant (admin/rh connecte qui envoie le contrat).
  // Remplace le defaut org.representative dans le bloc parties et la signature.
  employerRepresentativeOverride?: string;
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
  // Karim 2026-05-29 (v6) : ordre correct = TITRE en haut, puis parties Entre/Et,
  // puis articles. Le markdownToHtml rend le `# CONTRAT...` comme bloc encadre,
  // donc l ordre est titre (dans bodyWithoutHeader) + partiesBlock + reste.
  // On split donc le bodyHtml en : "tete jusqu au titre" + partiesBlock + "reste"
  const bodyHtmlFull = markdownToHtml(bodyWithoutHeader);
  // Cherche la fin du bloc titre (premier </div> apres doc-title)
  const titleEndMatch = bodyHtmlFull.match(/<div class="doc-title">[\s\S]*?<\/div>/);
  const bodyHtml = titleEndMatch
    ? bodyHtmlFull.slice(0, titleEndMatch.index! + titleEndMatch[0].length)
      + partiesBlock
      + bodyHtmlFull.slice(titleEndMatch.index! + titleEndMatch[0].length)
    : partiesBlock + bodyHtmlFull;

  const org = EMPLOYER_ORGS[args.employerOrg];
  const employerName = org.name;
  const contractLocation = String(vars.contract_location ?? "Bruxelles");
  const fullHtml = buildContractHtmlForDocuseal({
    contractBodyHtml: bodyHtml,
    templateCode: args.templateCode,
    employerName,
    employeeName: args.employeeData.full_name,
    contractLocation,
    employerSignatureDataUrl: args.employerSignatureDataUrl,
    // Karim 2026-05-30 : override si fourni (= admin/rh connecté), sinon defaut org
    employerRepresentativeName: args.employerRepresentativeOverride ?? org.representative,
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
    employerData?: EmployerOrg;
    employerRepresentativeOverride?: string;
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
  const org = args.employerData ?? EMPLOYER_ORGS[args.employerOrg];
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
    employerRepresentative: args.employerRepresentativeOverride ?? org.representative,
    // Karim 2026-05-30 : harmonise "L'employé" pour tous les contrats (y compris student)
    employeeRoleLabel: "L'employé",
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
