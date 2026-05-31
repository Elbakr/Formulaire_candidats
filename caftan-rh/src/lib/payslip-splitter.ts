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

// Karim 2026-05-30 : on utilise unpdf (wrap pdfjs-dist pour Node sans worker)
// car Turbopack ne resoud pas pdf.worker.mjs et "fake worker" plante.
// unpdf est concu pour Next.js / Edge / serverless.

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
  // Karim 2026-05-30 : texte concatene des pages du groupe (debug parser)
  rawText?: string;
}

/**
 * Karim 2026-05-29 : extrait le texte de chaque page d un PDF.
 * Utilise unpdf (wrap pdfjs-dist pour Node sans worker).
 *
 * Karim 2026-05-30 : clone les bytes pour eviter que unpdf detache le buffer
 * (sinon pdf-lib n a plus rien a charger ensuite -> "No PDF header found").
 */
export async function extractPagesText(pdfBytes: Uint8Array | ArrayBuffer): Promise<PageText[]> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const src = pdfBytes instanceof ArrayBuffer ? new Uint8Array(pdfBytes) : pdfBytes;
  // Clone : unpdf detache le buffer source apres usage
  const data = new Uint8Array(src);
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages.map((t, i) => ({ pageNumber: i + 1, text: t ?? "" }));
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

  // Karim 2026-05-30 : pattern principal unpdf - le nom apparait juste apres
  // "Période: DD-MM-YYYY - DD-MM-YYYY" et avant l adresse (rue type).
  // Ex : "Période: 01-05-2026 - 10-05-2026 ELBAZI Hidaya Kammestraat 37A"
  // Le Prenom est limite a UN mot (pas chainer "Hidaya Kammestraat") sauf si
  // c est un Prenom compose avec tiret ("Marie-Claire").
  const periodePattern = /P[ée]riode\s*:?\s*\d{1,2}-\d{1,2}-\d{4}\s+-\s+\d{1,2}-\d{1,2}-\d{4}\s+([A-ZÀ-Ý]{2,}(?:\s+[A-ZÀ-Ý]{2,}){0,2})\s+([A-ZÀ-Ý][a-zà-ÿ]+(?:-[A-ZÀ-Ý][a-zà-ÿ]+)?)/;
  const m0 = pageText.match(periodePattern);
  if (m0) return { name: `${m0[1]} ${m0[2]}`.trim(), niss };

  // Fallback HR Consult : pattern legacy (nom apres /Mois ou /Heure)
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
  // Karim 2026-05-31 : supporte FR (FEUILLE DE PAIE) + NL (LOONBRIEF) pour sites Anvers
  return /FEUILLE\s+DE\s+PAIE/i.test(pageText) || /LOONBRIEF/i.test(pageText);
}

/**
 * Karim 2026-05-29 : extrait l IBAN beneficiaire depuis la "FORMULE DE PAIEMENT".
 * Ex : "FORMULE DE PAIEMENT / 82,39 EUR par liste paiements sur compte
 *       bancaire BE80 0637 2116 0477 de ELBAZI Hidaya"
 */
export function detectEmployeeIban(pageText: string): string | null {
  // Karim 2026-05-31 : FR "compte bancaire" + NL "op rekening"
  const m = pageText.match(/(?:compte\s+bancaire|op\s+rekening)\s+(BE\d{2}(?:\s*\d{4}){3})/i);
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

  // Karim 2026-05-30 : unpdf renvoie "Salaire net 82,39EUR" (EUR colle au montant)
  // au lieu de "Salaire net EUR 82,39" comme pdftotext layout.
  // Karim 2026-05-31 : ajout patterns NL pour sites Anvers
  // (Netto loon, Te betalen, BETAALWIJZE).
  const amountRe = `([0-9]{1,3}(?:[\\s.,][0-9]{3})*[,.][0-9]{2})`;
  // FR
  const netHr = txt.match(new RegExp(`Salaire\\s+net\\s+(?:EUR\\s+)?${amountRe}\\s*(?:EUR|€)?`, "i"));
  const netAp = txt.match(new RegExp(`A\\s+payer\\s+(?:EUR\\s+)?${amountRe}\\s*(?:EUR|€)?`, "i"));
  const netGen = txt.match(new RegExp(`(?:net\\s*a\\s*payer|net\\s+imposable|total\\s+net)\\s*[:\\s]*${amountRe}\\s*(?:EUR|€)?`, "i"));
  const netFormule = txt.match(new RegExp(`FORMULE\\s+DE\\s+PAIEMENT\\s+${amountRe}\\s*EUR`, "i"));
  // NL (LOONBRIEF Anvers)
  const netNlLoon = txt.match(new RegExp(`Netto\\s+loon\\s+(?:EUR\\s+)?${amountRe}\\s*(?:EUR|€)?`, "i"));
  const netNlTe = txt.match(new RegExp(`Te\\s+betalen\\s+(?:EUR\\s+)?${amountRe}\\s*(?:EUR|€)?`, "i"));
  const netNlBet = txt.match(new RegExp(`BETAALWIJZE[\\s\\S]{0,50}?${amountRe}\\s+EUR`, "i"));
  const netM = netHr ?? netAp ?? netGen ?? netFormule ?? netNlLoon ?? netNlTe ?? netNlBet;
  const net = netM ? parseAmountFr(netM[1]) : null;

  // HR Consult : "BRUT SOUMIS A L'ONSS: EUR 84,68" ou "84,68EUR" + NL "BRUTO ONDERWORPEN AAN RSZ"
  const grossHr = txt.match(new RegExp(`BRUT\\s+SOUMIS\\s+A\\s+L['’]?ONSS\\s*:?\\s*(?:EUR\\s+)?${amountRe}\\s*(?:EUR|€)?`, "i"));
  const grossNl = txt.match(new RegExp(`BRUTO\\s+ONDERWORPEN\\s+AAN\\s+RSZ\\s*:?\\s*(?:EUR\\s+)?${amountRe}\\s*(?:EUR|€)?`, "i"));
  const grossGen = txt.match(new RegExp(`(?:salaire\\s+brut|brut\\s+imposable|total\\s+brut)\\s*[:\\s]*${amountRe}\\s*(?:EUR|€)?`, "i"));
  const grossM = grossHr ?? grossNl ?? grossGen;
  const gross = grossM ? parseAmountFr(grossM[1]) : null;

  // HR Consult : "Période: 01-05-2026 - 31-05-2026" (FR) ou "Periode: 19-05-2026 - 31-05-2026" (NL)
  const periodHr = txt.match(/P[ée�]?riode\s*:?\s*\d{1,2}[-\/]([0-1]?\d)[-\/](\d{4})/i);
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

    // Karim 2026-05-30 : CHAQUE "FEUILLE DE PAIE" = NOUVELLE fiche, sans exception.
    // Meme si 2 fiches d affilee pour le meme employee (cas double fiche legitime
    // ou regularisation), elles DOIVENT etre splittees pour pouvoir appliquer la
    // regle "la plus petite est differee j+6". Pas de regroupement par NISS.
    const startsNewGroup = isStart;

    if (!startsNewGroup && current && (!isStart) && (!name || (name === current.employeeNameRaw))) {
      // Page CONTINUATION (pas de "FEUILLE DE PAIE" detectee) - rare, ex: annexe
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
  // Karim 2026-05-30 : clone explicite pour chaque consumer (unpdf detache le buffer)
  const bytesForUnpdf = new Uint8Array(pdfBytes);
  const bytesForPdfLib = new Uint8Array(pdfBytes);
  const pages = await extractPagesText(bytesForUnpdf);
  const groups = groupPagesByEmployee(pages);
  const srcDoc = await PDFDocument.load(bytesForPdfLib);
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
      rawText: fullText,
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
