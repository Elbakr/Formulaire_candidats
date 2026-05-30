// Karim 2026-05-29 : QR EPC069-12 (SEPA Credit Transfer QR) pour fiches de paie.
//
// Standard EPC069-12 (European Payments Council) - QR scannable par toutes
// les apps bancaires SEPA EU (BNP Paribas Fortis, ING, Belfius, KBC, etc.)
// Reference : https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation
//
// Format du payload (lignes separees par \n) :
//   BCD                 <- Service tag
//   002                 <- Version 2 (v1 si pas de BIC)
//   1                   <- Character set : 1 = UTF-8
//   SCT                 <- Identification : SEPA Credit Transfer
//   GEBABEBB            <- BIC du beneficiaire (optionnel en v2)
//   AMD MEGASTORE SRL   <- Nom beneficiaire (max 70 chars)
//   BE00...             <- IBAN beneficiaire
//   EUR123.45           <- Montant (EUR + montant avec point decimal)
//   SALA                <- Purpose code (SALA = salaire) - optionnel
//   ref-structuree      <- Reference structuree - optionnel
//   Salaire mai 2026    <- Remittance info non structuree (max 140 chars)
//
// Limite QR : 331 caracteres pour rester en niveau M (medium error correction).

import QRCode from "qrcode";

export interface EpcQrInput {
  beneficiaryName: string;       // ex: "Karim Elbazi" (sera tronque a 70 chars)
  iban: string;                  // ex: "BE68539007547034" (espaces autorises, seront retires)
  bic?: string;                  // ex: "GEBABEBB" (optionnel en v2)
  amountEur: number;             // ex: 1234.56 (sera formate "EUR1234.56")
  remittanceInfo?: string;       // ex: "Salaire mai 2026" (max 140 chars, tronque)
  purposeCode?: string;          // ex: "SALA" pour salaire (4 chars max)
  structuredReference?: string;  // ex: "RF18 5390 0754" (optionnel)
}

export interface EpcQrOutput {
  payload: string;               // string EPC069-12 brute (a embarquer dans le QR)
  qrPngDataUrl: string;          // "data:image/png;base64,..." pour <img>
  qrSvg?: string;                // <svg> string (optionnel)
}

// Normalise IBAN : supprime espaces et passe en majuscule.
function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

// Validation IBAN basique (longueur + chars).
function isValidIban(iban: string): boolean {
  const clean = normalizeIban(iban);
  if (clean.length < 15 || clean.length > 34) return false;
  if (!/^[A-Z]{2}[0-9A-Z]+$/.test(clean)) return false;
  // Belgique : 16 chars (BE + 14 digits)
  if (clean.startsWith("BE") && clean.length !== 16) return false;
  return true;
}

// Tronque en respectant la limite de chars max.
function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

// Formate le montant en "EUR1234.56" (point decimal, pas d arrondi superflu).
function formatAmount(amountEur: number): string {
  if (!Number.isFinite(amountEur) || amountEur < 0.01 || amountEur > 999999999.99) {
    throw new Error(`Montant EPC invalide : ${amountEur} (doit etre entre 0.01 et 999999999.99)`);
  }
  return `EUR${amountEur.toFixed(2)}`;
}

/**
 * Construit le payload EPC069-12 brut (a embarquer dans un QR).
 */
export function buildEpcPayload(input: EpcQrInput): string {
  const iban = normalizeIban(input.iban);
  if (!isValidIban(iban)) {
    throw new Error(`IBAN invalide : ${input.iban}`);
  }
  const name = truncate(input.beneficiaryName.trim(), 70);
  if (!name) throw new Error("Nom beneficiaire vide");
  const remittance = truncate((input.remittanceInfo ?? "").trim(), 140);
  const purpose = truncate((input.purposeCode ?? "").trim().toUpperCase(), 4);
  const ref = truncate((input.structuredReference ?? "").trim(), 35);
  const bic = (input.bic ?? "").trim().toUpperCase();
  const amount = formatAmount(input.amountEur);

  // V2 = autorise BIC vide. V1 = BIC obligatoire (pas utilise ici).
  const lines = [
    "BCD",          // 1 - Service Tag
    "002",          // 2 - Version
    "1",            // 3 - Character set UTF-8
    "SCT",          // 4 - SEPA Credit Transfer
    bic,            // 5 - BIC (peut etre vide en v2)
    name,           // 6 - Beneficiary name
    iban,           // 7 - IBAN
    amount,         // 8 - Amount EUR
    purpose,        // 9 - Purpose (optional, e.g. SALA)
    ref,            // 10 - Structured reference (optional)
    remittance,     // 11 - Unstructured remittance info
    // 12 - Beneficiary to originator info (non utilise)
  ];

  const payload = lines.join("\n");
  if (payload.length > 331) {
    throw new Error(`Payload EPC trop long : ${payload.length} chars (max 331)`);
  }
  return payload;
}

/**
 * Genere le QR EPC complet (payload + PNG data URL).
 */
export async function generateEpcQr(input: EpcQrInput): Promise<EpcQrOutput> {
  const payload = buildEpcPayload(input);
  const qrPngDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    width: 400,
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return { payload, qrPngDataUrl };
}

/**
 * Helper : formatte un nom de mois FR a partir d un numero (1-12) + annee.
 * Usage : "Salaire " + monthYearLabel(5, 2026) = "Salaire mai 2026"
 */
export function monthYearLabel(month: number, year: number, lang: "fr" | "nl" | "en" = "fr"): string {
  const months = {
    fr: ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"],
    nl: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  };
  const m = months[lang][month - 1] ?? "";
  return `${m} ${year}`.trim();
}

/**
 * Helper : compose la remittance info standard "Salaire <mois> <annee>".
 */
export function defaultSalaryRemittance(month: number, year: number, lang: "fr" | "nl" | "en" = "fr"): string {
  const prefix = lang === "nl" ? "Loon" : lang === "en" ? "Salary" : "Salaire";
  return `${prefix} ${monthYearLabel(month, year, lang)}`;
}
