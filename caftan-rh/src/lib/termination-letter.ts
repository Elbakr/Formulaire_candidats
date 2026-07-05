// Karim 2026-06-01 / refonte 2026-06-17 : convention « Cessation du contrat de
// travail de commun accord » (modèle 402.00 belge) rendue dans le MÊME « Super
// Layout » que les contrats (CSS Calibri/A4 partagé, titre encadré, bloc parties
// Entre/Et, cases de signature). Objectif : cohérence visuelle de TOUS les
// documents générés + règle de pagination « titre + corps sur la même page ».

import "server-only";
import { CONTRACT_CSS, EMPLOYEE_COMPACT_OVERRIDE } from "@/lib/docuseal-flow";
import { documentBrandingCss, documentBrandingHtml } from "@/lib/contract-branding";

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
  effective_date_iso: string; // YYYY-MM-DD
  signing_city: string; // "Schaerbeek"
  signing_date_iso: string; // YYYY-MM-DD
  // "esign" : mention électronique eIDAS ; "print" : mention manuscrite (stylo).
  mode?: "esign" | "print";
  // Karim 2026-06-18 : libellé de signature de l'entité (ex. « Caftan Factory By
  // AMD Megastore » / « Caftan Factory » / « Homix »).
  employer_signature_label?: string | null;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateBE(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch {
    return iso;
  }
}

function partiesBlock(d: TerminationLetterData): string {
  const e = escapeHtml;
  const v = (val: string) => (val ? e(val) : `<span class="dotted-fill"></span>`);
  const rep = (d.employer_representative_name ?? "").trim();
  return `
<div class="parties-block">
  <table>
    <tr><td class="col-prefix">Entre</td><td class="col-label">L'employeur</td><td class="col-sep">:</td><td class="col-value"><strong>${e(d.employer_org_name)}</strong></td></tr>
    <tr><td class="col-prefix"></td><td class="col-label">Adresse</td><td class="col-sep">:</td><td class="col-value">${v(d.employer_address)}</td></tr>
    <tr><td class="col-prefix"></td><td class="col-label">Localité</td><td class="col-sep">:</td><td class="col-value">${v(d.employer_city)}</td></tr>
    <tr><td class="col-prefix"></td><td class="col-label">Représenté par</td><td class="col-sep">:</td><td class="col-value">${rep ? e(rep) : `<span class="dotted-fill"></span>`}</td></tr>
    <tr><td class="col-prefix">Et</td><td class="col-label">Le travailleur</td><td class="col-sep">:</td><td class="col-value"><strong>${e(d.employee_full_name)}</strong></td></tr>
    <tr><td class="col-prefix"></td><td class="col-label">Adresse</td><td class="col-sep">:</td><td class="col-value">${v(d.employee_address)}</td></tr>
    <tr><td class="col-prefix"></td><td class="col-label">Localité</td><td class="col-sep">:</td><td class="col-value">${v(d.employee_city)}</td></tr>
  </table>
</div>
<p class="convenu-line">IL EST CONVENU CE QUI SUIT :</p>`.trim();
}

/**
 * Cœur du rendu : produit le document complet « Super Layout ».
 *  - opts.forSigning : place le marqueur <!--EMPLOYEE_SIG--> (remplacé par l'image
 *    de la signature du travailleur lors de la signature interne).
 *  - opts.employerSignatureDataUrl : signature employeur pré-apposée (image).
 *  - opts.toolbar : ajoute une barre (Imprimer / Fermer) pour l'aperçu standalone.
 */
function renderTerminationSuperLayout(
  d: TerminationLetterData,
  opts: { forSigning?: boolean; employerSignatureDataUrl?: string | null; toolbar?: boolean } = {},
): string {
  const effectiveStr = formatDateBE(d.effective_date_iso);
  const signingStr = formatDateBE(d.signing_date_iso);
  const preSigned = !!opts.employerSignatureDataUrl;
  const isPrint = d.mode === "print";

  const employeeZone = opts.forSigning
    ? `<div class="sig-zone"><!--EMPLOYEE_SIG--></div>`
    : `<div class="sig-zone"></div>`;
  const employeeSub = isPrint
    ? `<div class="sig-sub">(précédée de la mention manuscrite « lu et approuvé »)</div>`
    : `<div class="sig-sub">Lu et approuvé — signature électronique conforme eIDAS (UE n° 910/2014)</div>`;

  const employerZone = preSigned
    ? `<div class="sig-zone"><img src="${opts.employerSignatureDataUrl}" alt="Signature employeur" style="display:block;max-width:100%;max-height:50px;margin:0 auto;"></div>`
    : `<div class="sig-zone"></div>`;
  const employerSub = isPrint
    ? ""
    : `<div class="sig-sub">Lu et approuvé — signature électronique conforme eIDAS (UE n° 910/2014)</div>`;

  const toolbar = opts.toolbar
    ? `<div class="no-print" style="position:sticky;top:0;z-index:10;background:rgba(255,255,255,0.96);border-bottom:1px solid #d6d8dd;padding:8px 12px;display:flex;gap:8px;justify-content:flex-end;backdrop-filter:blur(6px);">
        <button type="button" onclick="if(window.history.length>1){window.history.back()}else{window.close()}" style="background:#eef0f4;color:#111;border:1px solid #d6d8dd;padding:8px 14px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;">← Fermer</button>
        <button type="button" onclick="window.print()" style="background:#0b5fff;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;">🖨️ Imprimer (PDF)</button>
      </div>
      <style>@media print{.no-print{display:none!important}}</style>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Cessation du contrat de travail - Commun accord</title>
<style>${CONTRACT_CSS}${EMPLOYEE_COMPACT_OVERRIDE}${documentBrandingCss(true)}</style>
</head>
<body class="contract-employee">
${documentBrandingHtml(true)}
${toolbar}
<div class="doc-title"><h1>CESSATION DU CONTRAT DE TRAVAIL DE COMMUN ACCORD</h1></div>

${partiesBlock(d)}

<section class="article-block">
  <p>Conformément aux dispositions de l'article 1134 du Code Civil, le contrat de travail liant les soussignés prend fin, de leur commun accord, le <strong>${effectiveStr}</strong>.</p>
  <p>Cette cessation des relations de travail ne s'accompagne d'aucune notification de préavis ni d'aucun paiement d'une quelconque indemnité compensatoire de préavis.</p>
  <p>Moyennant l'exécution de la présente convention, chacune des parties renonce à se prévaloir à l'égard de l'autre de tous droits nés ou à naître en raison ou à l'occasion des relations de travail ayant existé entre elles.</p>
  <p>De plus, chaque partie renonce à se prévaloir de toute erreur de droit ou de fait et de toute omission relative à l'existence ou à l'étendue de ses droits.</p>
</section>

<div class="sign-group" style="page-break-inside:avoid;break-inside:avoid;">
  <p class="closing-line">Fait en deux exemplaires à <strong>${escapeHtml(d.signing_city)}</strong>, le ${signingStr}.<br>Chaque partie reconnaît avoir reçu un exemplaire de la présente convention.</p>
  <div class="signatures">
    <div class="sig-row">
      <div class="sig-cell">
        <div class="sig-box">
          <div class="sig-title">Signature du travailleur</div>
          ${employeeZone}
          ${employeeSub}
        </div>
      </div>
      <div class="sig-cell">
        <div class="sig-box">
          <div class="sig-title">Signature de l'employeur ou de son délégué</div>
          ${d.employer_signature_label ? `<div style="font-weight:bold;font-size:9.5pt;margin-top:2pt;">${escapeHtml(d.employer_signature_label)}</div>` : ""}
          ${preSigned ? `<div class="sig-sub">(pré-signée numériquement)</div>` : ""}
          ${employerZone}
          ${employerSub}
        </div>
      </div>
    </div>
  </div>
</div>
<script>
  if (window.location.search.includes('print=1')) { setTimeout(() => window.print(), 400); }
</script>
</body>
</html>`;
}

/** Aperçu / impression standalone (barre Imprimer + Fermer). */
export function renderTerminationLetterHtml(
  d: TerminationLetterData,
  opts?: { toolbar?: boolean },
): string {
  return renderTerminationSuperLayout(d, { toolbar: opts?.toolbar ?? false });
}

/** Document à signer en interne : employeur pré-signé + marqueur signature travailleur. */
export function renderTerminationLetterForInternalSign(
  d: TerminationLetterData,
  opts?: { employerSignatureDataUrl?: string | null },
): string {
  return renderTerminationSuperLayout(
    { ...d, mode: "esign" },
    { forSigning: true, employerSignatureDataUrl: opts?.employerSignatureDataUrl ?? null, toolbar: false },
  );
}

/**
 * Compat DocuSeal (DORMANT — la rupture est passée en signature interne). Conservé
 * pour que `docuseal-termination.ts` (non utilisé) reste compilable. Ne pas réactiver
 * sans réintroduire les <signature-field> DocuSeal.
 */
export function renderTerminationLetterForDocuSeal(
  d: TerminationLetterData,
  opts?: { employerSignatureDataUrl?: string | null },
): string {
  return renderTerminationLetterForInternalSign(d, opts);
}
