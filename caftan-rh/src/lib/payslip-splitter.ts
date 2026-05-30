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
  // HR Consult specifique : NISS au format "No.Rég.Nat.: 06.05.31 374-50"
  // (espace entre les 2 derniers groupes, pas tiret comme NISS standard)
  const nissHr = pageText.match(/No\.?\s*R[ée�]?g\.?\s*Nat\.?\s*:?\s*(\d{2})[.\s]?(\d{2})[.\s]?(\d{2})\s+(\d{3})[\s-]?(\d{2})/i);
  // Fallback NISS generique (11 chiffres avec separateurs)
  const nissGen = pageText.match(/\b(\d{2})[.\s-](\d{2})[.\s-](\d{2})[\s-]?(\d{3})[.\s-]?(\d{2})\b/);
  const nissMatch = nissHr ?? nissGen;
  const niss = nissMatch ? `${nissMatch[1]}.${nissMatch[2]}.${nissMatch[3]}-${nissMatch[4]}.${nissMatch[5]}` : null;

  // HR Consult specifique : le nom apparait apres "Régime/Système:" ou
  // dans la colonne droite, format "NOM Prenom" ou "NOM PrenomA PrenomB".
  // Le nom est toujours en debut de mot avec NOM = 2+ chars majuscules.
  // Ex : "ELBAZI Hidaya", "EL BAZI Karim", "VAN DEN BERG Pierre"

  // 1ere tentative : pattern HR Consult typique (nom apres /Mois ou /Heure)
  const hrPattern = /(?:\/Mois|\/Heure)\s+([A-ZÀ-Ý]{2,}(?:\s+[A-ZÀ-Ý]{2,}){0,2})\s+([A-ZÀ-Ý][a-zà-ÿ]+(?:[\s-][A-ZÀ-Ý][a-zà-ÿ]+)*)/;
  const m1 = pageText.match(hrPattern);
  if (m1) return { name: `${m1[1]} ${m1[2]}`.trim(), niss };

  // 2eme : pattern generique NOM Prenom
  const namePatterns = [
    /\b([A-ZÀ-Ý]{2,}(?:\s+[A-ZÀ-Ý]{2,}){0,2})\s+([A-ZÀ-Ý][a-zà-ÿ]+(?:[\s-][A-ZÀ-Ý][a-zà-ÿ]+)*)\b/,
    /\b([A-ZÀ-Ý][a-zà-ÿ]+(?:[\s-][A-ZÀ-Ý][a-zà-ÿ]+)*)\s+([A-ZÀ-Ý]{2,}(?:\s+[A-ZÀ-Ý]{2,}){0,2})\b/,
  ];
  for (const pat of namePatterns) {
    const m = pageText.match(pat);
    if (m) {
      // Exclure faux positifs typiques HR Consult :
      // "AMD MEGASTORE SRL", "FEUILLE DE PAIE", "HUMAN RESOURCES CONSULT"
      const candidate = `${m[1]} ${m[2]}`.trim();
      if (/^(AMD|HUMAN|FEUILLE|RUE|ROUTE|HR\s)/i.test(candidate)) continue;
      return { name: candidate, niss };
    }
  }
  return { name: null, niss };
}

/**
 * Karim 2026-05-29 : detecte si une page commence une nouvelle fiche de paie
 * (utile pour le groupement des pages multiples d une meme fiche).
 */
export function isPayslipStartPage(pageText: string): boolean {
  return /FEUILLE\s+DE\s+PAIE/i.test(pageText);
}

/**
 * Karim 2026-05-29 : extrait l IBAN beneficiaire depuis la "FORMULE DE PAIEMENT".
 * Ex : "FORMULE DE PAIEMENT / 82,39 EUR par liste paiements sur compte
 *       bancaire BE80 0637 2116 0477 de ELBAZI Hidaya"
 */
export function detectEmployeeIban(pageText: string): string | null {
  const m = pageText.match(/compte\s+bancaire\s+(BE\d{2}(?:\s*\d{4}){3})/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
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

  // HR Consult : "Salaire net  EUR 82,39" - prioritaire sur les autres
  const netHr = txt.match(/Salaire\s+net\s+EUR\s+([0-9]{1,3}(?:[\s.,][0-9]{3})*[,.][0-9]{2})/i);
  // Fallback "A payer EUR ..."
  const netAp = txt.match(/A\s+payer\s+EUR\s+([0-9]{1,3}(?:[\s.,][0-9]{3})*[,.][0-9]{2})/i);
  // Fallback generique "Net a payer ..."
  const netGen = txt.match(/(?:net\s*a\s*payer|net\s+imposable|total\s+net)\s*[:\s]*([0-9]{1,3}(?:[\s.,][0-9]{3})*[,.][0-9]{2})\s*(?:€|EUR)?/i);
  const netM = netHr ?? netAp ?? netGen;
  const net = netM ? parseAmountFr(netM[1]) : null;

  // HR Consult : "BRUT SOUMIS A L'ONSS:  EUR 84,68"
  const grossHr = txt.match(/BRUT\s+SOUMIS\s+A\s+L['’]?ONSS\s*:?\s*(?:EUR\s+)?([0-9]{1,3}(?:[\s.,][0-9]{3})*[,.][0-9]{2})/i);
  const grossGen = txt.match(/(?:salaire\s+brut|brut\s+imposable|total\s+brut)\s*[:\s]*([0-9]{1,3}(?:[\s.,][0-9]{3})*[,.][0-9]{2})\s*(?:€|EUR)?/i);
  const grossM = grossHr ?? grossGen;
  const gross = grossM ? parseAmountFr(grossM[1]) : null;

  // HR Consult : "Période: 01-05-2026 - 31-05-2026" ou "P�riode" si encodage casse
  const periodHr = txt.match(/P[ée�]?riode\s*:?\s*\d{1,2}[-\/]([0-1]?\d)[-\/](\d{4})/);
  let periodMonth: number | null = null;
  let periodYear: number | null = null;
  if (periodHr) {
    periodMonth = parseInt(periodHr[1], 10);
    periodYear = parseInt(periodHr[2], 10);
  } else {
    const monthYearRe = /\b(0?[1-9]|1[0-2])[\/\-\.\s]+(20[0-9]{2})\b/;
    const monthNameRe = /\b(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(20[0-9]{2})\b/i;
    const mY = txt.match(monthYearRe);
    if (mY) {
      periodMonth = parseInt(mY[1], 10);
      periodYear = parseInt(mY[2], 10);
    } else {
      const mn = txt.match(monthNameRe);
      if (mn) {
        const monthNames = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
        const norm = mn[1].toLowerCase().replace(/[éè]/g, "e").replace(/û/g, "u");
        const idx = monthNames.indexOf(norm);
        if (idx >= 0) {
          periodMonth = idx + 1;
          periodYear = parseInt(mn[2], 10);
        }
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
    const isStart = isPayslipStartPage(p.text);
    const { name, niss } = detectEmployeeName(p.text);

    // HR Consult : chaque page "FEUILLE DE PAIE" = nouvelle fiche
    // (sauf si meme NISS que la fiche en cours -> continuation)
    let startsNewGroup = isStart;
    if (current && isStart && niss && current.niss && niss === current.niss) {
      // Meme NISS = continuation de la meme fiche (rare, ex : annexes)
      startsNewGroup = false;
    }

    if (!startsNewGroup && current && (niss === current.niss || (!niss && !name))) {
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
