// Karim 2026-07-04 : configuration Dimona ONSS Belgique. Recherche officielle faite.
//
// DÉCISION (Karim) : voie 1 = SEMI-AUTO (l'app prépare + portail + "marquer
// déclarée", validation humaine — déjà en place). Voie 2 = Web Service REST v2,
// ACTIVABLE MANUELLEMENT quand les accès seront disponibles (gate ci-dessous).
// Le BATCH est écarté (legacy, pour secrétariats sociaux ; le REST v2 le remplace).
//
// Web Service REST v2 (production depuis 13/06/2024 ; v1 déprécié 30/06/2025) :
//   - Portail API           : https://apiportal.socialsecurity.be/
//   - Doc REST              : https://www.rest-documentation.socialsecurity.be/
//   - Doc fonctionnelle v2  : .../dimona/documents/pdf/documentation-fonctionnelle-restv2_F.pdf
//   - OpenAPI v2 (Swagger)  : .../dimona/documents/yaml/openapi_dimona_v2.zip
//   PRÉREQUIS (côté Karim, en direct sans secrétariat) :
//     1) Certificat entreprise  2) Activer le canal REST dans Chaman + Gestionnaire
//     d'accès principal  3) Token OAuth2 (client credentials)  4) intégration (ce fichier).
//   RÈGLE : la validation Dimona reste HUMAINE -> confirmation 1 clic avant tout envoi.

export const DIMONA_PORTAL_URL = "https://www.socialsecurity.be/site_fr/employer/applics/dimona/index.htm";
export const DIMONA_PORTAL_NL = "https://www.socialsecurity.be/site_nl/employer/applics/dimona/index.htm";

// Web Service REST v2 : endpoints (à confirmer contre l'OpenAPI officiel lors de
// l'activation). Le token OAuth2 s'obtient sur le serveur OAuth de la sécu sociale.
export const DIMONA_API_BASE = process.env.DIMONA_API_BASE ?? "https://services.socialsecurity.be/REST/dimona/v2";
export const DIMONA_OAUTH_TOKEN_URL = process.env.DIMONA_OAUTH_TOKEN_URL ?? "";

// Gate d'ACTIVATION MANUELLE de la voie 2 : tant que les credentials OAuth2 ne sont
// pas configurés, l'app reste en semi-auto (portail). Karim active en fournissant
// DIMONA_OAUTH_CLIENT_ID / DIMONA_OAUTH_CLIENT_SECRET (+ certificat mTLS).
export function isDimonaRestEnabled(): boolean {
  return Boolean(process.env.DIMONA_OAUTH_CLIENT_ID?.trim() && process.env.DIMONA_OAUTH_CLIENT_SECRET?.trim());
}

/**
 * Champs requis pour une declaration Dimona IN (embauche).
 * Reference : https://www.socialsecurity.be/employer/instructions/dmfa/fr/latest/instructions/declaration/dimona_general/dimonas_belgique.html
 */
export type DimonaInPayload = {
  employerOnss: string;     // numero ONSS employeur (ex: "1234567-89")
  employerBce: string;      // numero BCE
  workerNiss: string;       // numero NRN employee (format XX.XX.XX-XXX.XX)
  workerLastName: string;
  workerFirstName: string;
  workerBirthDate: string;  // YYYY-MM-DD
  startDate: string;        // YYYY-MM-DD debut contrat
  endDate?: string;         // YYYY-MM-DD fin contrat (optionnel pour CDI)
  workerType: "OTH" | "STU" | "EXT"; // OTH=employe standard, STU=etudiant
  workplace?: string;       // code site/etablissement
};

/**
 * Voie 2 (REST v2) — ACTIVABLE MANUELLEMENT. Tant que la gate isDimonaRestEnabled()
 * est fausse (pas de credentials OAuth2), on reste en semi-auto (portail). Une fois
 * les credentials + certificat fournis par Karim, l'intégration finale (token OAuth2
 * client credentials + POST du payload selon l'OpenAPI v2 + mTLS) est câblée ici.
 */
export async function submitDimonaIn(
  payload: DimonaInPayload,
): Promise<{ ok: true; dimonaPeriodId: string } | { ok: false; error: string }> {
  void payload;
  if (!isDimonaRestEnabled()) {
    return {
      ok: false,
      error: "Voie REST non activée. Déclare via le portail (semi-auto) : bouton « Ouvrir le portail Dimona ». Pour activer l'envoi automatique : certificat entreprise + Chaman + credentials OAuth2 (DIMONA_OAUTH_CLIENT_ID/SECRET).",
    };
  }
  // Credentials présents -> intégration REST v2 à finaliser contre l'OpenAPI officiel
  // (endpoint DIMONA_API_BASE, token DIMONA_OAUTH_TOKEN_URL). À câbler avec les accès réels.
  return {
    ok: false,
    error: "Voie REST activée mais intégration finale à câbler (payload OpenAPI v2 + mTLS). Fournis les accès pour terminer.",
  };
}

/**
 * Construit l URL deep-link vers le portail Dimona avec donnees pre-remplies
 * dans l URL (si supporte par le portail), sinon lien simple vers l accueil.
 */
export function buildDimonaPortalUrl(args: {
  language?: "fr" | "nl";
  workerNiss?: string;
  startDate?: string;
}): string {
  // Le portail Dimona ne supporte pas le deep-link via URL parameters
  // officiellement, donc on retourne l accueil avec note pour Karim.
  void args.workerNiss;
  void args.startDate;
  return args.language === "nl" ? DIMONA_PORTAL_NL : DIMONA_PORTAL_URL;
}
