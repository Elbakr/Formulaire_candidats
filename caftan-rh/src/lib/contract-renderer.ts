// Karim 2026-05-22 : moteur de rendu pour les contract_templates. Substitue
// les variables {{xxx}} dans le markdown du template avec les donnees
// reelles de l employe. Supporte aussi les blocs conditionnels minimaux
// {{#if var}}...{{/if}} pour les sections optionnelles (end_date, etc.).
//
// Karim 2026-05-29 : support multi-entites juridiques. AMD Megastore (existant)
// + Caftan Factory (nouveau). Le choix se fait via input.employerOrg.

export type ContractVariables = Record<string, string | number | null | undefined>;

export type EmployerOrgKey = "amd_megastore" | "caftan_factory";

export type EmployerOrg = {
  key: EmployerOrgKey;
  name: string;
  bce: string;          // numero d entreprise BCE/KBO
  onss: string;         // numero ONSS employeur
  address: string;
  locality: string;
  representative: string;
  // Karim 2026-05-29 : 2e representant legal possible (Kamal pour AMD).
  // Permet la signature alternative si le 1er representant est absent.
  // Affiche dans le PDF avec la mention "(à signer si nécessaire)".
  co_representative?: string;
  co_representative_email?: string; // pour signature optionnelle DocuSeal
  rc?: string;          // numero registre commerce / tribunal
  paritary_commission: string;
};

/**
 * Karim 2026-05-29 : registre des entites juridiques. Les valeurs hardcodees
 * doivent etre migrees vers une table org_settings a terme. Pour l instant
 * c est plus simple (et plus type-safe) de garder ici.
 *
 * Karim 2026-05-29 (v4) : valeurs employeur PRE-REMPLIES exhaustivement
 * (BCE, ONSS, RC, adresse, representant + co-representant Kamal) pour matcher
 * les PDF du secretariat social belge.
 */
export const EMPLOYER_ORGS: Record<EmployerOrgKey, EmployerOrg> = {
  amd_megastore: {
    key: "amd_megastore",
    name: "AMD MEGASTORE SRL",
    bce: "0660.936.422",
    onss: "1234567-89", // Karim 2026-05-29 : a confirmer aupres de Sodibel
    rc: "Bruxelles",
    address: "Rue de Brabant 230",
    locality: "1030 Schaerbeek",
    representative: "Karim Elbazi",
    co_representative: "Kamal Elbazi", // Karim 2026-05-29 : 2e gerant AMD
    co_representative_email: "kamal@elbazi.com",
    paritary_commission: "CP du commerce de détail indépendant n°201",
  },
  caftan_factory: {
    key: "caftan_factory",
    name: "CAFTAN FACTORY",
    bce: "à compléter",
    onss: "à compléter",
    rc: "Bruxelles",
    address: "Adresse Bruxelles à compléter",
    locality: "1000 Bruxelles",
    representative: "Karim Elbazi",
    paritary_commission: "CP du commerce de détail indépendant n°201",
  },
};

export const DEFAULT_EMPLOYER_ORG: EmployerOrgKey = "amd_megastore";

/**
 * Substitue {{var}} par sa valeur et applique {{#if x}}...{{/if}}.
 * Les variables non definies deviennent un placeholder lisible.
 */
export function renderContractTemplate(
  templateBody: string,
  variables: ContractVariables,
): string {
  // 1. Traiter les {{#if VAR}}...{{/if}}
  let out = templateBody.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, varName: string, inner: string) => {
      const v = variables[varName];
      if (v == null || v === "" || v === "0") return "";
      return inner;
    },
  );
  // 2. Substituer les {{var}} simples
  out = out.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
    const v = variables[varName];
    if (v == null || v === "") return `_______________`; // placeholder a remplir
    return String(v);
  });
  return out;
}

/**
 * Construit les variables a partir d un employee. Champs employeur fixes
 * (AMD MEGASTORE SRL Schaerbeek) + champs employes lus de la fiche +
 * overrides (le RH peut ajuster avant envoi).
 */
export function buildContractVariables(input: {
  employee: {
    full_name: string;
    nrn?: string | null;
    address?: string | null;
    postal_code?: string | null;
    city?: string | null;
    job_title?: string | null;
    weekly_hours?: number | null;
    hourly_rate?: number | null;
    contract_type?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    iban?: string | null;
    bic?: string | null;
  };
  primarySite?: { code: string; name: string; address?: string | null; city?: string | null } | null;
  employerOrg?: EmployerOrgKey;
  overrides?: Partial<ContractVariables>;
}): ContractVariables {
  // Karim 2026-05-29 : selectionne l entite juridique. Default AMD Megastore.
  const org = EMPLOYER_ORGS[input.employerOrg ?? DEFAULT_EMPLOYER_ORG];
  const e = input.employee;
  // Split nom complet en first + last (heuristique simple : 1er mot = prenom)
  const parts = (e.full_name ?? "").trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");
  const grossMonthly = e.hourly_rate && e.weekly_hours
    ? (e.hourly_rate * e.weekly_hours * 4.33).toFixed(2)
    : "";
  const workplace = input.primarySite
    ? `${input.primarySite.code} — ${input.primarySite.name}${input.primarySite.address ? `, ${input.primarySite.address}` : ""}${input.primarySite.city ? ` ${input.primarySite.city}` : ""}`
    : `${org.address}, ${org.locality}`;
  // Karim 2026-05-29 : politique metier - jamais de CDI. Si une fiche
  // contient encore 'CDI' (legacy), on l interprete comme 'CDD' pour eviter
  // d emettre un contrat non conforme.
  const contractDuration =
    e.contract_type === "Étudiant" || e.contract_type === "Etudiant"
      ? "un travail nettement défini (contrat d'occupation étudiant)"
      : "une durée déterminée";
  const today = new Date().toISOString().slice(0, 10);

  return {
    // Karim 2026-05-29 : Employeur depuis EMPLOYER_ORGS (multi-entites)
    employer_name: org.name,
    employer_bce: org.bce,
    employer_onss: org.onss,
    employer_address: org.address,
    employer_locality: org.locality,
    employer_representative: org.representative,
    employer_co_representative: org.co_representative ?? "",
    employer_rc: org.rc ?? "",
    paritary_commission: org.paritary_commission,
    // Employe
    employee_first_name: firstName,
    employee_last_name: lastName,
    employee_niss: e.nrn ?? "",
    employee_address: e.address ?? "",
    employee_locality: e.postal_code && e.city ? `${e.postal_code} ${e.city}` : (e.city ?? ""),
    // Engagement
    start_date: e.start_date ?? "",
    end_date: e.end_date ?? "",
    contract_duration: contractDuration,
    position: e.job_title ?? "Employé(e) de vente",
    tasks: "Accueil clients, vente, encaissement, mise en rayon, gestion stock",
    workplace,
    // Duree de travail
    weekly_hours: e.weekly_hours ?? "",
    schedule_type: "horaire fixe",
    schedule_table: "(à compléter dans la dialog)",
    schedule_grid: "(à compléter dans la dialog)",
    // Remuneration
    gross_salary: grossMonthly,
    salary_period: "mois",
    benefits: "Néant",
    iban: e.iban ?? "",
    bic: e.bic ?? "",
    // Date / lieu contrat - depend du signature_place de l employe (Karim 2026-05-29)
    contract_location: org.locality.replace(/^\d+\s*/, "") || "Schaerbeek",
    contract_date: today,
    special_conditions: "",
    // Overrides (ecrasent les defaults)
    ...input.overrides,
  };
}
