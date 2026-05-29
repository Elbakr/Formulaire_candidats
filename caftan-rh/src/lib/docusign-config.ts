// Karim 2026-05-29 : Configuration DocuSign + squelette d integration.
//
// IMPORTANT : Le compte DocuSign Business Pro EU doit etre cree manuellement
// par Karim via https://www.docusign.com/products-and-pricing (carte bancaire
// + signature requis - impossible d automatiser). Une fois cree, remplir les
// 4 variables d env ci-dessous.
//
// Type de compte recommande : DocuSign Business Pro EU (~40 EUR/mois)
//   - Datacenter EU (RGPD)
//   - Signature electronique qualifiee eIDAS (QES)
//   - 100+ envois/mois
//   - Templates reutilisables
//
// Etapes de setup DocuSign :
// 1. Signup avec email du company (recommande : contact@amdmegastore.be ou
//    karim@... selon entite juridique)
// 2. Configurer Connect webhook : URL = https://<domain>/api/docusign/webhook
// 3. Recuperer integrationKey (UUID), userId (UUID), accountId (GUID),
//    secretKey via My Apps > Connected Apps
// 4. Generer RSA keypair pour JWT auth (24h tokens) :
//    openssl genrsa -out private.key 2048
//    openssl rsa -in private.key -pubout -out public.key
//    -> uploader public.key dans DocuSign Admin > Apps
// 5. Remplir .env.local + ajouter au Vercel env vars (Production + Preview)

export const DOCUSIGN_CONFIG = {
  // OAuth (JWT Grant - server-to-server)
  baseUrl: process.env.DOCUSIGN_BASE_URL ?? "https://eu.docusign.net/restapi",
  oauthUrl: process.env.DOCUSIGN_OAUTH_URL ?? "https://account-d.docusign.com",
  integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY ?? "",
  userId: process.env.DOCUSIGN_USER_ID ?? "",
  accountId: process.env.DOCUSIGN_ACCOUNT_ID ?? "",
  privateKeyB64: process.env.DOCUSIGN_PRIVATE_KEY_B64 ?? "",
  // Pour DocuSign Connect webhook signature verification
  webhookSecret: process.env.DOCUSIGN_WEBHOOK_SECRET ?? "",
};

export function isDocusignConfigured(): boolean {
  return Boolean(
    DOCUSIGN_CONFIG.integrationKey &&
    DOCUSIGN_CONFIG.userId &&
    DOCUSIGN_CONFIG.accountId &&
    DOCUSIGN_CONFIG.privateKeyB64,
  );
}

/**
 * Karim 2026-05-29 : envoi d une envelope DocuSign avec 2 signers
 * (employee + employer). Pour l instant : stub qui rend une erreur claire
 * tant que DocuSign n est pas configure. Quand configure :
 * - Authentifie via JWT Grant
 * - Cree envelope avec template ou PDF brut
 * - Ajoute tabs (signHere employer + employee, initialHere chaque page,
 *   dateSigned)
 * - Retourne envelopeId pour persistance
 */
export type SendEnvelopeArgs = {
  employeeName: string;
  employeeEmail: string;
  employerName: string; // ex: "AMD MEGASTORE SRL"
  employerEmail: string;
  pdfBase64: string; // contrat PDF
  contractTitle: string; // "Contrat CDD - John Doe"
};

export async function sendDocusignEnvelope(
  args: SendEnvelopeArgs,
): Promise<{ ok?: boolean; envelopeId?: string; error?: string }> {
  if (!isDocusignConfigured()) {
    return {
      error: "DocuSign non configure. Voir DOCUSIGN_CONFIG / docs/DOCUSIGN_SETUP.md",
    };
  }
  // TODO Karim : implementation JWT Grant + envelope creation
  // Voir https://developers.docusign.com/platform/auth/jwt/jwt-get-token/
  return {
    error: "TODO: implementation envelope create. Voir lib/docusign-config.ts",
  };
}
