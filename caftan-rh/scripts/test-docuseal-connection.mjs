#!/usr/bin/env node
// Karim 2026-05-29 : test connexion DocuSeal (cloud ou self-hosted).
//
// Usage : node scripts/test-docuseal-connection.mjs
//
// Lit DOCUSEAL_BASE_URL + DOCUSEAL_API_KEY depuis .env.local et teste :
//   1. Connectivite reseau
//   2. Auth API key
//   3. Liste templates disponibles
//   4. Compte test users (combien il en reste sur le free tier)

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const BASE = process.env.DOCUSEAL_BASE_URL;
const KEY = process.env.DOCUSEAL_API_KEY;

if (!BASE || !KEY) {
  console.error("❌ DOCUSEAL_BASE_URL ou DOCUSEAL_API_KEY manquants dans .env.local");
  console.error("");
  console.error("Ajoute ces 2 lignes :");
  console.error("  DOCUSEAL_BASE_URL=https://api.docuseal.com");
  console.error("  DOCUSEAL_API_KEY=<ta cle depuis Settings → API>");
  process.exit(1);
}

console.log(`Base URL : ${BASE}`);
console.log(`API Key  : ${KEY.slice(0, 8)}...${KEY.slice(-4)}`);
console.log("");

// Test 1 : ping
try {
  const r = await fetch(`${BASE.replace(/\/$/, "")}/templates?limit=5`, {
    headers: { "X-Auth-Token": KEY },
  });
  console.log(`✓ HTTP ${r.status}`);
  if (!r.ok) {
    const body = await r.text();
    console.error(`❌ Auth a echoue. Verifie ta cle API.`);
    console.error(`Reponse : ${body.slice(0, 200)}`);
    process.exit(1);
  }
  const data = await r.json();
  console.log(`✓ Connexion OK`);
  console.log("");
  console.log(`Templates trouves : ${data.data?.length ?? 0}`);
  if (data.data && data.data.length > 0) {
    for (const t of data.data) {
      console.log(`  - id=${t.id} | ${t.name} (${t.slug})`);
    }
  } else {
    console.log(`  (aucun template - normal pour un compte tout neuf)`);
    console.log("");
    console.log(`Prochaines etapes :`);
    console.log(`  1. Dans DocuSeal Admin, va dans "Templates"`);
    console.log(`  2. Clique "New Template" et upload un PDF de contrat`);
    console.log(`  3. Ajoute les tabs visuels (signature, date, etc.)`);
    console.log(`  4. Note l ID du template pour l integration CaftanRH`);
  }
} catch (e) {
  console.error(`❌ Erreur reseau : ${e.message}`);
  console.error(`Verifie que ${BASE} est accessible.`);
  process.exit(1);
}

console.log("");
console.log("=== TOUT EST OK ===");
console.log("");
console.log("Pour activer DocuSeal dans CaftanRH :");
console.log("  1. Ajoute dans .env.local :");
console.log("     SIGNATURE_PROVIDER=docuseal");
console.log("  2. Restart le dev server (npm run dev)");
console.log("  3. Va sur /admin/settings/signature pour confirmer 'Actif'");
