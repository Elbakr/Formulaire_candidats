// Karim 2026-05-29 : configuration Dimona ONSS Belgique.
//
// Portail employeur officiel : https://www.socialsecurity.be (DIMONA In/Out)
// Documentation API e-Dimona REST/SOAP :
//   https://www.socialsecurity.be/lambda/portail/employer/dimona
//
// Etape 1 (deja en place) : notification + relances pour rappeler de faire
// la declaration manuellement sur le portail
// Etape 2 (TODO) : script auto qui declenche la Dimona via API officielle
//   (necessite certificat technique employeur + acces compte ONSS)

export const DIMONA_PORTAL_URL = "https://www.socialsecurity.be/site_fr/employer/applics/dimona/index.htm";
export const DIMONA_PORTAL_NL = "https://www.socialsecurity.be/site_nl/employer/applics/dimona/index.htm";

// API officielle e-Dimona (a utiliser etape 2 quand certificat dispo)
export const DIMONA_API_BASE = process.env.DIMONA_API_BASE ?? "https://services.socialsecurity.be/dimona/v1";

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
 * Etape 2 - stub. A implementer quand certificat technique AMD Megastore
 * sera dispo + acces API ONSS configure (necessite SSL client cert).
 */
export async function submitDimonaIn(
  payload: DimonaInPayload,
): Promise<{ ok: true; dimonaPeriodId: string } | { ok: false; error: string }> {
  void payload;
  // TODO Karim : implementation reelle quand certificat dispo
  // 1. Authentifier via certificat technique (X509 mTLS)
  // 2. Construire SOAP envelope ou JSON REST selon endpoint
  // 3. POST sur DIMONA_API_BASE/declarations
  // 4. Parser response -> recuperer periodId Dimona
  // 5. Stocker periodId dans table employee_dimona_declarations
  return {
    ok: false,
    error: "Auto-Dimona pas encore active. Necessite certificat technique employeur ONSS. Cliquer 'Ouvrir le portail Dimona' pour declarer manuellement.",
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
