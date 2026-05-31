#!/usr/bin/env node
// Karim 2026-05-31 : regénère le QR EPC pour Doha (fix net=0, langue NL).

import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const { generateEpcQr, defaultSalaryRemittance } = await import("../src/lib/qr-epc.ts");

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const epc = await generateEpcQr({
  beneficiaryName: "Rekimi Doha",
  iban: "BE25 6506 1570 3382",
  amountEur: 176.49,
  remittanceInfo: defaultSalaryRemittance(5, 2026, "nl"), // "Loon mei 2026"
  purposeCode: "SALA",
});

await c.query(
  "update payslips set qr_epc_payload = $1, qr_png_data_url = $2 where id = 'cfee1eac-56d2-4b1a-ac75-2f3c77db226c'",
  [epc.payload, epc.qrPngDataUrl],
);

console.log("QR EPC Doha régénéré :");
console.log(epc.payload);
await c.end();
