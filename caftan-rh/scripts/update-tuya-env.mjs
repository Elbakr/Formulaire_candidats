// Karim 2026-05-24 : remplace les variables TUYA_* dans .env.local par les
// nouvelles valeurs du projet Central Europe. Ce script ne logue PAS les
// secrets en clair, juste un masque.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

const NEW = {
  TUYA_CLIENT_ID: "wcr5gd3xtg99eamqrsms",
  TUYA_CLIENT_SECRET: "8a202f0cb0ed474cbcbad2e3ab9f1c0b",
  TUYA_PROJECT_CODE: "p1779618748262w5xuw5",
  TUYA_BASE_URL: "https://openapi.tuyaeu.com",
  TUYA_SPACE_ID: "206482687",
};

let content = readFileSync(envPath, "utf-8");
const lines = content.split(/\r?\n/);
const out = [];
const replaced = new Set();
for (const line of lines) {
  const m = line.match(/^(TUYA_[A-Z_]+)=/);
  if (m && m[1] in NEW) {
    out.push(`${m[1]}=${NEW[m[1]]}`);
    replaced.add(m[1]);
  } else {
    out.push(line);
  }
}
// Ajoute les vars manquantes
for (const k of Object.keys(NEW)) {
  if (!replaced.has(k)) {
    out.push(`${k}=${NEW[k]}`);
  }
}
writeFileSync(envPath, out.join("\n"), "utf-8");

const mask = (s) => s ? `${s.slice(0, 4)}...${s.slice(-3)}` : "(vide)";
console.log("Tuya .env.local mis a jour :");
for (const [k, v] of Object.entries(NEW)) {
  console.log(`  ${k}=${k === "TUYA_BASE_URL" ? v : mask(v)}`);
}
console.log("\nVars remplacees :", [...replaced].join(", "));
