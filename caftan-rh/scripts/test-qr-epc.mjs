#!/usr/bin/env node
// Karim 2026-05-29 : test rapide du module QR EPC SEPA.
// Genere un QR PNG pour 1234.56 EUR vers un IBAN test et l ouvre.

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import dynamique du module TS via tsx
const { generateEpcQr, defaultSalaryRemittance } = await import("../src/lib/qr-epc.ts");

const out = await generateEpcQr({
  beneficiaryName: "Omaima El Mansouri",
  iban: "BE68 5390 0754 7034",
  bic: "GEBABEBB",
  amountEur: 1234.56,
  remittanceInfo: defaultSalaryRemittance(5, 2026, "fr"),
  purposeCode: "SALA",
});

console.log("=== EPC PAYLOAD ===");
console.log(out.payload);
console.log("\n=== PAYLOAD LENGTH:", out.payload.length, "chars (max 331) ===");
console.log("\n=== QR PNG length:", out.qrPngDataUrl.length, "chars data URL ===");

const pngBuf = Buffer.from(out.qrPngDataUrl.split(",")[1], "base64");
const outPath = resolve(__dirname, "../test-qr-output.png");
writeFileSync(outPath, pngBuf);
console.log(`\nQR PNG ecrit : ${outPath}`);
console.log("Ouvre-le pour scanner avec ton app BNP Paribas.");
