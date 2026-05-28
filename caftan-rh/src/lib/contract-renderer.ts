// Karim 2026-05-22 : moteur de rendu pour les contract_templates. Substitue
// les variables {{xxx}} dans le markdown du template avec les donnees
// reelles de l employe. Supporte aussi les blocs conditionnels minimaux
// {{#if var}}...{{/if}} pour les sections optionnelles (end_date, etc.).

export type ContractVariables = Record<string, string | number | null | undefined>;

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
      if (v == null || v === "" || v === false || v === "0") return "";
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
  overrides?: Partial<ContractVariables>;
}): ContractVariables {
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
    : "";
  const contractDuration =
    e.contract_type === "CDI"
      ? "une durée indéterminée"
      : e.contract_type === "CDD"
        ? "une durée déterminée"
        : "un travail nettement défini";
  const today = new Date().toISOString().slice(0, 10);

  return {
    // Employeur (fixe)
    employer_name: "AMD MEGASTORE SRL",
    employer_address: "Rue de Brabant 230",
    employer_locality: "1030 Schaerbeek",
    employer_representative: "Karim Elbazi",
    paritary_commission: "CP du commerce de détail indépendant n°201",
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
    // Date / lieu contrat
    contract_location: "Schaerbeek",
    contract_date: today,
    special_conditions: "",
    // Overrides (ecrasent les defaults)
    ...input.overrides,
  };
}
