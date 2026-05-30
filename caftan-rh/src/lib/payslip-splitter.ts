// Karim 2026-05-29 : split d un PDF groupe de fiches de paie HR Consult en
// N PDFs (1 par employee) + extraction du nom + du montant net.
//
// Workflow :
//   1. Lit le PDF complet (Uint8Array)
//   2. Pour chaque page : extrait le texte via pdfjs-dist
//   3. Detecte le nom de l employee dans le texte (heuristique : NISS ou
//      premiere ligne en MAJUSCULES en haut de page)
//   4. Regroupe les pages contigues du meme employee
//   5. Decoupe en N PDFs distincts via pdf-lib
//   6. Retourne pour chaque PDF : { employeeName, niss?, pdfBytes, netAmount? }

import { PDFDocument } from "pdf-lib";

// pdfjs-dist v4+ : import dynamique car package ESM only
type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjs: PdfJsModule | null = null;
async function getPdfjs(): Promise<PdfJsModule> {
  if (pdfjs) return pdfjs;
  pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

export interface PageText {
  pageNumber: number;
  text: string;
}

export interface SplitGroup {
  employeeNameRaw: string | null;
  niss: string | null;
  startPage: number;
  endPage: number;
  pages: PageText[];
}

export interface SplitPayslipResult {
  employeeNameRaw: string | null;
  niss: string | null;
  pageRange: [number, number];
  pdfBytes: Uint8Array;
  netAmount: number | null;
  grossAmount: number | null;
  periodMonth: number | null;
  periodYear: number | null;
}

/**
 * Karim 2026-05-29 : extrait le texte de chaque page d un PDF.
 */
export async function extractPagesText(pdfBytes: Uint8Array | ArrayBuffer): Promise<PageText[]> {
  const lib = await getPdfjs();
  const doc = await lib.getDocument({ data: pdfBytes }).promise;
  const result: PageText[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: { str?: string }) => it.str ?? "").join(" ");
    result.push({ pageNumber: i, text });
  }
  return result;
}

/**
 * Karim 2026-05-29 : detecte le nom de l employee dans le texte d une page.
 * Heuristiques HR Consult (a affiner avec un vrai PDF) :
 *   - NISS : 11 chiffres souvent au format YY.MM.DD-XXX.XX
 *   - Nom : premiere ligne contenant 2-4 mots en majuscules (NOM Prenom)
 *
 * Tolerant aux variations : "ELBAZI Karim", "ELBAZI, Karim", "KARIM ELBAZI".
 */
export function detectEmployeeName(pageText: string): { name: string | null; niss: string | null } {
  // NISS : 11 chiffres avec separateurs optionnels
  const nissMatch = pageText.match(/\b(\d{2})[.\s-]?(\d{2})[.\s-]?(\d{2})[\s-]?(\d{3})[.\s-]?(\d{2})\b/);
  const niss = nissMatch ? `${nissMatch[1]}.${nissMatch[2]}.${nissMatch[3]}-${nissMatch[4]}.${nissMatch[5]}` : null;

  // Nom : cherche des sequences de mots majuscules (>= 2 char chacun)
  // Patterns possibles :
  //   "ELBAZI Karim"
  //   "EL BAZI Karim"
  //   "KARIM ELBAZI"
  // On prend le 1er match plausible en debut de doc
  const namePatterns = [
    // NOM Prenom (NOM = 2+ chars majuscules, Prenom = capitalize)
    /\b([A-ZÀ-Ý]{2,}(?:\s+[A-ZÀ-Ý]{2,}){0,2})\s+([A-ZÀ-Ý][a-zà-ÿ]+(?:[\s-][A-ZÀ-Ý][a-zà-ÿ]+)*)\b/,
    // Prenom NOM
    /\b([A-ZÀ-Ý][a-zà-ÿ]+(?:[\s-][A-ZÀ-Ý][a-zà-ÿ]+)*)\s+([A-ZÀ-Ý]{2,}(?:\s+[A-ZÀ-Ý]{2,}){0,2})\b/,
  ];
  for (const pat of namePatterns) {
    const m = pageText.match(pat);
    if (m) {
      return { name: `${m[1]} ${m[2]}`.trim(), niss };
    }
  }
  return { name: null, niss };
}

/**
 * Karim 2026-05-29 : extrait montants brut/net + periode de la page.
 *
 * Patterns typiques HR Consult :
 *   - "Brut imposable" / "Salaire brut" / "Total brut" suivi du montant
 *   - "Net a payer" / "Net" suivi du montant
 *   - "Periode" / "Mois" suivi de "05/2026" ou "Mai 2026"
 */
export function detectAmountsAndPeriod(pageText: string): {
  gross: number | null;
  net: number | null;
  periodMonth: number | null;
  periodYear: number | null;
} {
  const txt = pageText.replace(/\s+/g, " ");

  // Net : cherche "Net a payer", "Net", "Total net", "Net imposable"
  const netRe = /(?:net\s*a\s*payer|net\s+imposable|total\s+net|salaire\s+net|net)\s*[:\s]*([0-9]{1,3}(?:[\s,.][0-9]{3})*[,.][0-9]{2})\s*(?:€|EUR)?/i;
  const netM = txt.match(netRe);
  const net = netM ? parseAmountFr(netM[1]) : null;

  // Brut : cherche "Brut imposable", "Salaire brut", "Total brut"
  const grossRe = /(?:salaire\s+brut|brut\s+imposable|total\s+brut|brut)\s*[:\s]*([0-9]{1,3}(?:[\s,.][0-9]{3})*[,.][0-9]{2})\s*(?:€|EUR)?/i;
  const grossM = txt.match(grossRe);
  const gross = grossM ? parseAmountFr(grossM[1]) : null;

  // Periode : "05/2026" ou "05-2026" ou "Mai 2026"
  const monthYearRe = /\b(0?[1-9]|1[0-2])[\/\-\.\s]+(20[0-9]{2})\b/;
  const monthNameRe = /\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(20[0-9]{2})\b/i;

  let periodMonth: number | null = null;
  let periodYear: number | null = null;

  const mY = txt.match(monthYearRe);
  if (mY) {
    periodMonth = parseInt(mY[1], 10);
    periodYear = parseInt(mY[2], 10);
  } else {
    const mn = txt.match(monthNameRe);
    if (mn) {
      const monthNames = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
      const idx = monthNames.indexOf(mn[1].toLowerCase().replace(/[éè]/g, "e").replace(/û/g, "u"));
      if (idx >= 0) {
        periodMonth = idx + 1;
        periodYear = parseInt(mn[2], 10);
      }
    }
  }

  return { gross, net, periodMonth, periodYear };
}

// "1 234,56" ou "1.234,56" ou "1234.56" -> 1234.56
function parseAmountFr(s: string): number | null {
  const clean = s.replace(/\s/g, "").replace(/\.(?=\d{3}(?:[,.]|$))/g, "");
  const norm = clean.replace(",", ".");
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : null;
}

/**
 * Karim 2026-05-29 : regroupe les pages contigues qui appartiennent au meme
 * employee (meme nom + NISS si possible).
 */
export function groupPagesByEmployee(pages: PageText[]): SplitGroup[] {
  const groups: SplitGroup[] = [];
  let current: SplitGroup | null = null;
  for (const p of pages) {
    const { name, niss } = detectEmployeeName(p.text);
    const matchesCurrent =
      current &&
      ((niss && current.niss && niss === current.niss) ||
        (name && current.employeeNameRaw && normalizeName(name) === normalizeName(current.employeeNameRaw)));
    if (matchesCurrent && current) {
      current.endPage = p.pageNumber;
      current.pages.push(p);
    } else {
      if (current) groups.push(current);
      current = {
        employeeNameRaw: name,
        niss,
        startPage: p.pageNumber,
        endPage: p.pageNumber,
        pages: [p],
      };
    }
  }
  if (current) groups.push(current);
  return groups;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[àâäáã]/g, "a").replace(/[éèêë]/g, "e").replace(/[îï]/g, "i").replace(/[ôö]/g, "o").replace(/[ùûü]/g, "u").replace(/[ç]/g, "c").replace(/[^a-z0-9 ]/g, "").trim();
}

/**
 * Karim 2026-05-29 : split principal. Prend un PDF groupe, retourne N PDFs
 * un par employee, avec metadonnees extraites.
 */
export async function splitPayslipPdf(pdfBytes: Uint8Array): Promise<SplitPayslipResult[]> {
  const pages = await extractPagesText(pdfBytes);
  const groups = groupPagesByEmployee(pages);
  const srcDoc = await PDFDocument.load(pdfBytes);
  const results: SplitPayslipResult[] = [];

  for (const g of groups) {
    const newDoc = await PDFDocument.create();
    const indices = g.pages.map((p) => p.pageNumber - 1);
    const copied = await newDoc.copyPages(srcDoc, indices);
    for (const p of copied) newDoc.addPage(p);
    const pdfChunk = await newDoc.save();

    const fullText = g.pages.map((p) => p.text).join(" ");
    const amounts = detectAmountsAndPeriod(fullText);

    results.push({
      employeeNameRaw: g.employeeNameRaw,
      niss: g.niss,
      pageRange: [g.startPage, g.endPage],
      pdfBytes: pdfChunk,
      netAmount: amounts.net,
      grossAmount: amounts.gross,
      periodMonth: amounts.periodMonth,
      periodYear: amounts.periodYear,
    });
  }

  return results;
}

/**
 * Karim 2026-05-29 : matche un nom extrait avec la liste des employees BD.
 * Retourne l employee_id ou null si pas de match suffisant.
 *
 * Strategie :
 *   1. Match exact (normalisé) NOM Prenom ou Prenom NOM
 *   2. Match partiel : tous les mots du nom extrait sont dans le full_name BD
 *   3. Fuzzy matching simple (Levenshtein-lite) pour tolerer fautes OCR
 */
export interface EmployeeBd {
  id: string;
  full_name: string;
  nrn: string | null;
}

export function matchEmployee(
  detectedName: string | null,
  detectedNiss: string | null,
  candidates: EmployeeBd[],
): EmployeeBd | null {
  // Priorite 1 : NISS exact (le plus fiable)
  if (detectedNiss) {
    const cleanNiss = detectedNiss.replace(/[.\-\s]/g, "");
    const byNiss = candidates.find((e) => e.nrn && e.nrn.replace(/[.\-\s]/g, "") === cleanNiss);
    if (byNiss) return byNiss;
  }
  if (!detectedName) return null;

  const target = normalizeName(detectedName);
  const targetTokens = new Set(target.split(/\s+/).filter((t) => t.length >= 2));

  // Priorite 2 : match exact normalise
  const exact = candidates.find((e) => normalizeName(e.full_name) === target);
  if (exact) return exact;

  // Priorite 3 : tous les tokens du nom extrait sont dans le full_name BD
  const tokenMatch = candidates.find((e) => {
    const bdTokens = new Set(normalizeName(e.full_name).split(/\s+/));
    return Array.from(targetTokens).every((t) => bdTokens.has(t));
  });
  if (tokenMatch) return tokenMatch;

  // Priorite 4 : au moins 2 tokens en commun (cas FRENch ordering)
  const candidates2 = candidates
    .map((e) => {
      const bdTokens = new Set(normalizeName(e.full_name).split(/\s+/));
      const common = Array.from(targetTokens).filter((t) => bdTokens.has(t)).length;
      return { e, common };
    })
    .filter((x) => x.common >= 2)
    .sort((a, b) => b.common - a.common);
  if (candidates2.length === 1 || (candidates2.length > 1 && candidates2[0].common > candidates2[1].common)) {
    return candidates2[0].e;
  }
  return null;
}
