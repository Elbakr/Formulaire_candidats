// Karim 2026-05-30 : module qui définit les champs OBLIGATOIRES pour qu'un
// contrat puisse être envoyé à signer.
// Sert à :
//   - bouton "Envoyer à signer" conditionnel (gris/vert)
//   - mail "Demander infos manquantes" au candidat
//   - check serveur avant DocuSeal

export interface RequiredFieldDef {
  key: string;
  label: string;
  pageSection?: string;
  // Karim 2026-05-30 : si true, ce champ est decide par l admin/RH
  // (pas a demander au candidat). Toujours requis pour generer le contrat
  // mais EXCLU du mail "infos manquantes" envoye au travailleur.
  adminOnly?: boolean;
}

export interface MissingField extends RequiredFieldDef {
  currentValue: unknown;
}

// Champs requis communs pour TOUS les types de contrat (CDD + Étudiant).
// adminOnly = true pour les champs decides par admin/RH (pas a demander au candidat)
const COMMON_REQUIRED: RequiredFieldDef[] = [
  { key: "full_name", label: "Nom complet", pageSection: "Identité" },
  { key: "email", label: "Email", pageSection: "Identité" },
  { key: "birth_date", label: "Date de naissance", pageSection: "Identification" },
  { key: "nrn", label: "NRN (registre national)", pageSection: "Identification" },
  { key: "address", label: "Adresse", pageSection: "Identification" },
  { key: "postal_code", label: "Code postal", pageSection: "Identification" },
  { key: "city", label: "Ville", pageSection: "Identification" },
  { key: "iban", label: "IBAN bancaire", pageSection: "Banque & transport" },
  // Karim 2026-05-30 : admin-only (decidés par admin/RH, pas candidate)
  { key: "weekly_hours", label: "Heures/semaine", pageSection: "Contrat", adminOnly: true },
  { key: "start_date", label: "Date d'entrée", pageSection: "Contrat", adminOnly: true },
  { key: "contract_type", label: "Type de contrat (CDD/Étudiant)", pageSection: "Contrat", adminOnly: true },
];

// CDD a besoin de end_date - admin-only
const CDD_EXTRA: RequiredFieldDef[] = [
  { key: "end_date", label: "Date de fin (CDD)", pageSection: "Contrat", adminOnly: true },
];

// Étudiant idem
const STUDENT_EXTRA: RequiredFieldDef[] = [
  { key: "end_date", label: "Date de fin (contrat étudiant)", pageSection: "Contrat", adminOnly: true },
];

export function getRequiredFields(contractType: string | null): RequiredFieldDef[] {
  const isStudent = contractType === "Étudiant" || contractType === "Etudiant";
  return isStudent ? [...COMMON_REQUIRED, ...STUDENT_EXTRA] : [...COMMON_REQUIRED, ...CDD_EXTRA];
}

/**
 * Retourne les champs manquants/vides.
 * Un champ est considere vide si :
 *   - null / undefined
 *   - chaine vide ou whitespace
 *   - 0 pour weekly_hours (valeur sentinelle pas remplie)
 */
export function getMissingFields(
  employee: Record<string, unknown>,
  contractType: string | null,
): MissingField[] {
  const required = getRequiredFields(contractType);
  const missing: MissingField[] = [];
  for (const f of required) {
    const v = employee[f.key];
    let isEmpty = false;
    if (v == null) isEmpty = true;
    else if (typeof v === "string" && v.trim() === "") isEmpty = true;
    else if (f.key === "weekly_hours" && typeof v === "number" && v <= 0) isEmpty = true;
    if (isEmpty) missing.push({ ...f, currentValue: v });
  }
  return missing;
}

export function isReadyForContract(
  employee: Record<string, unknown>,
  contractType: string | null,
): boolean {
  return getMissingFields(employee, contractType).length === 0;
}

/**
 * Karim 2026-05-30 : compute % completion pour badge visuel sur la fiche.
 */
export function completionPercent(
  employee: Record<string, unknown>,
  contractType: string | null,
): number {
  const required = getRequiredFields(contractType);
  if (required.length === 0) return 100;
  const missing = getMissingFields(employee, contractType).length;
  return Math.round(((required.length - missing) / required.length) * 100);
}
