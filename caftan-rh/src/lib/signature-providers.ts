// Karim 2026-05-29 : abstraction "Signature Provider" pour permettre au RH
// de choisir le moyen de signature electronique (gratuit ou premium).
//
// 3 providers disponibles :
//   1. INTERNAL (canvas) — GRATUIT, deja en place (/sign/[token]) — signature
//      electronique simple (eIDAS Art. 25) — valable mais valeur probante
//      moindre. Recommande pour majorite des cas CDD/Etudiant.
//
//   2. DOCUSEAL — GRATUIT (self-hosted) ou freemium (cloud) — open source,
//      signature electronique avancee (AeS). Equivalent technique DocuSign.
//      URL : https://www.docuseal.com/
//      Self-host : docker run docuseal/docuseal
//      Cloud free : 5 PDF/mois free, ensuite ~30 EUR/mois
//
//   3. DOCUSIGN — PAYANT (Business Pro EU ~40 EUR/mois) — signature
//      electronique qualifiee (QES eIDAS) — meilleure valeur probante,
//      reconnaissance EU. Reserve aux contrats critiques.
//
// Le RH choisit le provider par defaut dans /admin/settings/signature.
// Il peut aussi override par contrat.

export type SignatureProviderKey = "internal" | "docuseal" | "docusign";

export type SignatureProvider = {
  key: SignatureProviderKey;
  name: string;
  pricing: string;
  legalValue: string;
  pros: string[];
  cons: string[];
  setupUrl?: string;
  envVars: string[];
};

export const SIGNATURE_PROVIDERS: Record<SignatureProviderKey, SignatureProvider> = {
  internal: {
    key: "internal",
    name: "Signature interne (canvas)",
    pricing: "Gratuit (deja en place)",
    legalValue: "Signature electronique simple (eIDAS Art. 25)",
    pros: [
      "Aucune dependance externe",
      "Aucun cout",
      "Workflow deja fonctionnel via /sign/[token]",
      "Trace d audit en BD",
      "Acceptable pour CDD / Etudiant standard",
    ],
    cons: [
      "Valeur probante moindre si litige",
      "Pas de certificat horodate qualifie",
      "Repose sur l identite de l email de l employee",
    ],
    envVars: [],
  },
  docuseal: {
    key: "docuseal",
    name: "DocuSeal (open source)",
    pricing: "Self-hosted GRATUIT, ou cloud 5 docs/mois gratuit, puis ~30 EUR/mois",
    legalValue: "Signature electronique avancee (AeS) - eIDAS",
    pros: [
      "Open source (auto-hebergement possible)",
      "Equivalent technique a DocuSign",
      "API REST simple",
      "Templates PDF avec tags visuels",
      "Compliance RGPD si self-hosted EU",
    ],
    cons: [
      "Setup self-host = 1h technique (Docker)",
      "Cloud free limite a 5 docs/mois",
      "Pas de QES (signature qualifiee) en standard",
    ],
    setupUrl: "https://www.docuseal.com/",
    envVars: [
      "DOCUSEAL_BASE_URL (ex: https://docuseal.example.com)",
      "DOCUSEAL_API_KEY (depuis Admin > API)",
      "DOCUSEAL_WEBHOOK_SECRET (pour signature verification)",
    ],
  },
  docusign: {
    key: "docusign",
    name: "DocuSign Business Pro EU",
    pricing: "~40 EUR/mois (100+ envois/mois)",
    legalValue: "Signature electronique qualifiee (QES eIDAS) - valeur manuscrite",
    pros: [
      "Standard du marche",
      "QES = preuve juridique forte",
      "Datacenter EU (RGPD)",
      "Notifications email natives",
      "Certificate of Completion archivable",
    ],
    cons: [
      "Payant",
      "Setup compte = carte bancaire requise",
      "Workflow JWT auth = 1h dev",
    ],
    setupUrl: "https://www.docusign.com/products-and-pricing",
    envVars: [
      "DOCUSIGN_INTEGRATION_KEY",
      "DOCUSIGN_USER_ID",
      "DOCUSIGN_ACCOUNT_ID",
      "DOCUSIGN_PRIVATE_KEY_B64",
      "DOCUSIGN_WEBHOOK_SECRET",
    ],
  },
};

export const DEFAULT_SIGNATURE_PROVIDER: SignatureProviderKey = "internal";

/**
 * Lit le provider choisi depuis env var (ou la table org_settings dans une
 * version future). Fallback : internal (signature canvas existante).
 */
export function getActiveSignatureProvider(): SignatureProviderKey {
  const env = process.env.SIGNATURE_PROVIDER;
  if (env === "docuseal" || env === "docusign" || env === "internal") return env;
  return DEFAULT_SIGNATURE_PROVIDER;
}

/**
 * Verifie si le provider est correctement configure (env vars presentes).
 */
export function isProviderConfigured(key: SignatureProviderKey): boolean {
  if (key === "internal") return true; // toujours dispo
  if (key === "docuseal") {
    return Boolean(process.env.DOCUSEAL_BASE_URL && process.env.DOCUSEAL_API_KEY);
  }
  if (key === "docusign") {
    return Boolean(
      process.env.DOCUSIGN_INTEGRATION_KEY &&
      process.env.DOCUSIGN_USER_ID &&
      process.env.DOCUSIGN_ACCOUNT_ID &&
      process.env.DOCUSIGN_PRIVATE_KEY_B64,
    );
  }
  return false;
}
