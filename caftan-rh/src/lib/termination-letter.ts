// Karim 2026-06-01 : génère la lettre officielle "Cessation du contrat de
// travail de commun accord" (modèle 402.00 belge) en HTML, fidèle au PDF
// original. Conservée en HTML pour pouvoir :
//   - L'afficher en preview avant envoi
//   - L'imprimer (window.print) côté client
//   - La convertir en PDF côté server (via Puppeteer si on a un service)
//
// Format papier : A4 portrait, marges 2.5cm.

import "server-only";

export interface TerminationLetterData {
  // Employeur
  employer_org_name: string;
  employer_address: string;
  employer_city: string;
  employer_representative_name?: string | null;
  // Travailleur
  employee_full_name: string;
  employee_address: string;
  employee_city: string;
  // Convention
  effective_date_iso: string;  // YYYY-MM-DD
  signing_city: string;        // "Schaerbeek"
  signing_date_iso: string;    // YYYY-MM-DD (date à laquelle la convention est signée)
}

function formatDateBE(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);
    return `${dd}-${mm}-${yy}`;
  } catch {
    return iso;
  }
}

/**
 * Karim 2026-06-01 : variante DocuSeal — embarque les balises
 * <signature-field role="Employee"/Employer"> que DocuSeal interprète pour
 * placer les zones de signature dans le PDF A4 généré.
 *
 * Utilisé via POST /templates/html sur DocuSeal Cloud (cf. docuseal-flow.ts
 * pour le pattern de référence sur les contrats).
 */
export function renderTerminationLetterForDocuSeal(d: TerminationLetterData): string {
  const baseHtml = renderTerminationLetterHtml(d);
  // Remplace les 2 sig-box statiques par des sig-box avec signature-field DocuSeal.
  return baseHtml.replace(
    /<div class="signatures">[\s\S]*?<\/div>\s*<\/body>/,
    `<div class="signatures">
    <div class="sig-box">
      <div class="sig-title">Signature du travailleur</div>
      <div class="sig-sub">(précédée de la mention manuscrite « lu et approuvé »)</div>
      <div style="margin-top: 14pt;">
        <signature-field name="Signature travailleur" role="Employee" required="true" style="display: block; width: 100%; height: 50pt;"></signature-field>
      </div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Signature de l'employeur ou de son délégué</div>
      <div style="margin-top: 14pt;">
        <signature-field name="Signature employeur" role="Employer" required="true" style="display: block; width: 100%; height: 50pt;"></signature-field>
      </div>
    </div>
  </div>
</body>`,
  );
}

export function renderTerminationLetterHtml(d: TerminationLetterData): string {
  const effectiveStr = formatDateBE(d.effective_date_iso);
  const signingStr = formatDateBE(d.signing_date_iso);
  const repFilled = (d.employer_representative_name ?? "").trim();
  const repDisplay = repFilled
    ? repFilled
    : "………………………………………………………………………………………………………….…………...………………………………………";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Cessation du contrat de travail - Commun accord</title>
<style>
  @page { size: A4 portrait; margin: 2.5cm 2.2cm; }
  * { box-sizing: border-box; }
  /* Karim 2026-06-01 : wrapper A4 visible en preview navigateur (fond gris,
     page blanche centree avec ombre). En print, on revient au flow natif. */
  html { background: #eceef2; }
  body {
    font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #000;
    margin: 0;
    padding: 24pt 0;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(255,255,255,0.95);
    border-bottom: 1px solid #d6d8dd;
    padding: 8pt 16pt;
    text-align: right;
    backdrop-filter: blur(6px);
    margin: -24pt 0 24pt 0;
  }
  .toolbar button {
    background: #0b5fff;
    color: #fff;
    border: none;
    padding: 8pt 16pt;
    border-radius: 6px;
    font-size: 10.5pt;
    cursor: pointer;
    font-weight: 600;
  }
  .toolbar button:hover { background: #084ad8; }
  .a4-page {
    width: 21cm;
    min-height: 29.7cm;
    max-width: 21cm;
    margin: 0 auto;
    padding: 2.5cm 2.2cm;
    background: #fff;
    box-shadow: 0 4pt 16pt rgba(0,0,0,0.12);
  }
  @media print {
    html, body { background: #fff !important; padding: 0 !important; }
    .toolbar { display: none !important; }
    .a4-page {
      width: auto;
      max-width: none;
      margin: 0;
      padding: 0;
      box-shadow: none;
      min-height: 0;
    }
  }
  h1.title {
    text-align: center;
    border: 1.5pt solid #000;
    padding: 8pt 10pt;
    font-size: 13.5pt;
    font-weight: 700;
    letter-spacing: 0.5pt;
    margin: 0 0 28pt 0;
  }
  .header-block { margin-bottom: 20pt; }
  .header-row { display: flex; align-items: baseline; margin-bottom: 4pt; }
  .header-row .col-side { width: 50pt; font-weight: 700; flex-shrink: 0; }
  .header-row .col-label { width: 100pt; font-weight: 700; flex-shrink: 0; }
  .header-row .col-value { flex: 1; }
  .header-row .col-label-light { width: 100pt; flex-shrink: 0; }
  .il-est { font-weight: 700; margin: 22pt 0 14pt 0; }
  p { margin: 0 0 12pt 0; text-align: justify; }
  .fait { margin: 26pt 0 14pt 0; }
  .signatures {
    display: flex;
    gap: 18pt;
    margin-top: 8pt;
  }
  .sig-box {
    flex: 1;
    border: 0.6pt solid #000;
    min-height: 90pt;
    padding: 6pt 8pt;
    font-size: 9.5pt;
    text-align: center;
  }
  .sig-box .sig-title { font-weight: 400; }
  .sig-box .sig-sub { font-size: 8pt; font-style: italic; }
  .dotted { letter-spacing: 0; }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()" type="button">🖨️ Imprimer (PDF)</button>
  </div>
  <div class="a4-page">
  <h1 class="title">CESSATION DU CONTRAT DE TRAVAIL DE COMMUN ACCORD</h1>

  <div class="header-block">
    <div class="header-row">
      <div class="col-side">Entre</div>
      <div class="col-label">L'employeur</div>
      <div class="col-value">: ${d.employer_org_name}</div>
    </div>
    <div class="header-row">
      <div class="col-side"></div>
      <div class="col-label-light">Adresse</div>
      <div class="col-value">: ${d.employer_address}</div>
    </div>
    <div class="header-row">
      <div class="col-side"></div>
      <div class="col-label-light">Localité</div>
      <div class="col-value">: ${d.employer_city}</div>
    </div>
    <div class="header-row">
      <div class="col-side"></div>
      <div class="col-label-light">Représenté par</div>
      <div class="col-value">: <span class="dotted">${repDisplay}</span></div>
    </div>

    <div class="header-row" style="margin-top:8pt;">
      <div class="col-side">Et</div>
      <div class="col-label">le travailleur</div>
      <div class="col-value">: ${d.employee_full_name}</div>
    </div>
    <div class="header-row">
      <div class="col-side"></div>
      <div class="col-label-light">Adresse</div>
      <div class="col-value">: ${d.employee_address}</div>
    </div>
    <div class="header-row">
      <div class="col-side"></div>
      <div class="col-label-light">Localité</div>
      <div class="col-value">: ${d.employee_city}</div>
    </div>
  </div>

  <div class="il-est">IL EST CONVENU CE QUI SUIT :</div>

  <p>Conformément aux dispositions de l'article 1134 du Code Civil, le contrat de travail liant les soussignés prend fin, de leur commun accord, le ${effectiveStr}</p>

  <p>Cette cessation des relations de travail ne s'accompagne donc d'aucune notification de préavis ni d'aucun paiement d'une quelconque indemnité compensatoire de préavis.</p>

  <p>Moyennant l'exécution de la présente convention, chacune des parties renonce à se prévaloir à l'égard de l'autre de tous droits nés ou à naître en raison ou à l'occasion des relations de travail ayant existé entre elles.</p>

  <p>De plus, chaque partie renonce à se prévaloir de toute erreur de droit ou de fait et de toute omission relative à l'existence ou à l'étendue de ses droits.</p>

  <p>Chaque partie reconnaît avoir reçu un exemplaire de la présente convention.</p>

  <div class="fait">Fait en deux exemplaires à ${d.signing_city}, le ${signingStr}</div>

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-title">Signature du travailleur</div>
      <div class="sig-sub">(précédée de la mention manuscrite « lu et approuvé »)</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Signature de l'employeur ou de son délégué</div>
    </div>
  </div>
  </div>
  <script>
    // Karim 2026-06-01 : auto-print si ?print=1 dans l URL
    if (window.location.search.includes('print=1')) {
      setTimeout(() => window.print(), 400);
    }
  </script>
</body>
</html>`;
}
