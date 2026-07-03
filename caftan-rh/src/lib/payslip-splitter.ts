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
      // Karim 2026-07-03 : rejette les faux positifs (titre/ville/société captés à la
      // place du nom, ex. "Schaerbeek FEUILLE DE PAIE"). Recherche CONTIENT, pas startsWith.
      if (/FEUILLE\s+DE\s+PAIE|LOONBRIEF|D[ÉE]COMPTE|P[ÉE]CULE|\bPRIME\b|MEGASTORE|CONSULT|HUMAN|\bSRL\b|\bBV\b|EMPLOYEUR|TRAVAILLEUR|\bRUE\b|\bROUTE\b|STRAAT|SCHAERBEEK|MOLENBEEK|BRUXELLES|BRUSSEL|ANVERS|ANTWERPEN|\bHR\b/i.test(candidate)) continue;
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
  // Karim 2026-05-31 : supporte FR (FEUILLE DE PAIE) + NL (LOONBRIEF) pour sites Anvers.
  return /FEUILLE\s+DE\s+PAIE/i.test(pageText) || /LOONBRIEF/i.test(pageText);
}

// Karim 2026-07-03 : détecte le TITRE d'un document HR Consult ouvrant une fiche —
// utilisé UNIQUEMENT pour le découpage (groupPagesByEmployee). "FEUILLE DE PAIE" /
// "LOONBRIEF" comptent n'importe où (ce sont toujours des titres). Les documents
// de fin de contrat (pécule de sortie, décompte, prime de fin d'année, 13e, NL) ne
// comptent que s'ils apparaissent EN TÊTE de page (~300 premiers caractères) : ces
// mots figurent aussi comme LIGNES de calcul sur une fiche normale, et les prendre
// n'importe où sur-découperait une fiche légitime à 2 pages (revue adversariale).
function isFicheBoundaryTitle(pageText: string): boolean {
  if (/FEUILLE\s+DE\s+PAIE/i.test(pageText) || /LOONBRIEF/i.test(pageText)) return true;
  const head = pageText.slice(0, 300);
  return (
    /D[ÉE]COMPTE(?:\s+DE\s+(?:SORTIE|D[ÉE]PART))?/i.test(head) ||
    /P[ÉE]CULE\s+DE\s+VACANCES/i.test(head) ||
    /PRIME\s+DE\s+FIN\s+D['’]ANN[ÉE]E/i.test(head) ||
    /\b13[EÈ]?\s*(?:ME|ÈME)?\s*MOIS/i.test(head) ||
    /VERTREKVAKANTIEGELD/i.test(head) ||
    /EINDEJAARSPREMIE/i.test(head) ||
    /AFREKENING/i.test(head)
  );
}

/**
 * Karim 2026-06-15 : détecte l'EMPLOYEUR depuis le CONTENU de la fiche (le nom
 * de société y figure), au lieu de se fier à l'expéditeur du mail (fragile).
 * Caftan Factory et AMD Megastore sont les deux entités. On teste Caftan en
 * premier (plus spécifique), puis AMD. Renvoie null si indéterminé.
 */
export function detectEmployerFromText(rawText: string | null | undefined): "amd_megastore" | "caftan_factory" | null {
  if (!rawText) return null;
  const t = rawText.toUpperCase();
  if (t.includes("CAFTAN")) return "caftan_factory";
  if (t.includes("AMD MEGASTORE") || t.includes("AMD MÉGASTORE") || /\bAMD\b/.test(t)) return "amd_megastore";
  return null;
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
  // Karim 2026-07-03 : découpage MULTI-ANCRAGES (fin du "un seul en-tête = seule
  // frontière" qui fusionnait 2 fiches distinctes — cas Nihad : salaire + pécule).
  // Une page OUVRE une nouvelle fiche si :
  //   - c'est la 1ère page, OU
  //   - elle porte un en-tête de document reconnu (isPayslipStartPage élargi), OU
  //   - l'identité (NISS ou nom normalisé) DIFFÈRE du groupe courant (changement
  //     de personne → frontière DURE, jamais fusionner 2 personnes), OU
  //   - elle a son PROPRE total "net à payer" alors que le groupe courant en a
  //     déjà un (2 fiches auto-portantes → on scinde).
  // Sinon (aucun ancrage + même identité) = vraie page de continuation (annexe /
  // 2e page d'une fiche) → rattachée au groupe courant.
  const groups: SplitGroup[] = [];
  let current: SplitGroup | null = null;
  let currentHasNet = false;
  let currentNet: number | null = null;
  let currentNameNorm: string | null = null;
  let currentNissNorm: string | null = null;

  const normNiss = (n: string | null) => (n ? n.replace(/[.\-\s]/g, "") : null);
  // Comparaison de nom INDÉPENDANTE DE L'ORDRE (NOM Prénom vs Prénom NOM = même
  // personne) → évite un faux "changement d'identité" qui sur-découperait.
  const sameNameTokens = (a: string, b: string) => {
    const A = new Set(a.split(/\s+/).filter((t) => t.length >= 2));
    const B = new Set(b.split(/\s+/).filter((t) => t.length >= 2));
    if (A.size === 0 || A.size !== B.size) return false;
    for (const t of A) if (!B.has(t)) return false;
    return true;
  };

  for (const p of pages) {
    const isTitle = isFicheBoundaryTitle(p.text);
    const { name, niss } = detectEmployeeName(p.text);
    const ownNet = detectAmountsAndPeriod(p.text).net;
    const hasOwnNet = ownNet != null;
    const nameNorm = name ? normalizeName(name) : null;
    const nissNorm = normNiss(niss);

    const identityChange =
      current != null &&
      ((!!nissNorm && !!currentNissNorm && nissNorm !== currentNissNorm) ||
        (!!nameNorm && !!currentNameNorm && !sameNameTokens(nameNorm, currentNameNorm)));

    // 2 nets DIFFÉRENTS (pas un simple récap répété) = 2 fiches auto-portantes.
    const netPairSplit = hasOwnNet && currentHasNet && ownNet !== currentNet;

    const opensNewFiche = current == null || isTitle || identityChange || netPairSplit;

    if (!opensNewFiche && current) {
      // Continuation : même personne, aucun nouvel ancrage.
      current.endPage = p.pageNumber;
      current.pages.push(p);
      if (hasOwnNet && !currentHasNet) { currentHasNet = true; currentNet = ownNet; }
      if (!currentNameNorm && nameNorm) { currentNameNorm = nameNorm; if (!current.employeeNameRaw) current.employeeNameRaw = name; }
      if (!currentNissNorm && nissNorm) { currentNissNorm = nissNorm; if (!current.niss) current.niss = niss; }
    } else {
      if (current) groups.push(current);
      current = { employeeNameRaw: name, niss, startPage: p.pageNumber, endPage: p.pageNumber, pages: [p] };
      currentHasNet = hasOwnNet;
      currentNet = ownNet;
      currentNameNorm = nameNorm;
      currentNissNorm = nissNorm;
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

  // Priorite 5 : tolerance TYPO (Karim 2026-07-03) - "forcer le mapping si 1 ou 2
  // lettres different". Levenshtein <= 2 sur le nom normalise TRIE par tokens
  // (ordre NOM/Prenom indifferent), avec candidat UNIQUE strictement le plus proche
  // (jamais de faux match ambigu sur de l'argent). Ex: "EBERTITAN Lina" (fiche) ->
  // "ElBertitan Lina" (employe), distance 1.
  const targetSorted = target.split(/\s+/).filter((t) => t.length >= 2).sort().join(" ");
  if (targetSorted.length >= 6) {
    const scored = candidates
      .map((e) => {
        const es = normalizeName(e.full_name).split(/\s+/).filter((t) => t.length >= 2).sort().join(" ");
        return { e, d: es.length >= 6 ? levenshtein(targetSorted, es) : 99 };
      })
      .filter((x) => x.d <= 2)
      .sort((a, b) => a.d - b.d);
    if (scored.length === 1 || (scored.length > 1 && scored[0].d < scored[1].d)) {
      return scored[0].e;
    }
  }
  return null;
}

// Distance de Levenshtein (edits) — pour la tolerance typo du matching.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
