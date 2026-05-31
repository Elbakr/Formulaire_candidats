// Karim 2026-05-29 : extracted from actions.ts car les fichiers "use server"
// ne peuvent pas exporter des fonctions sync (Next.js 16 strict).

export type SecsocOrg = "amd_megastore" | "caftan_factory";

export type OrgInfo = {
  name: string;
  bce: string | null;
  address: string;
  cp: string;
};

export const ORGS: Record<SecsocOrg, OrgInfo> = {
  amd_megastore: {
    name: "AMD Megastore SRL",
    bce: "0660.936.422",
    address: "Schaerbeek",
    cp: "201",
  },
  caftan_factory: {
    name: "Caftan Factory",
    bce: null,
    address: "Bruxelles",
    cp: "201",
  },
};

export function getSecsocOrgs(): Array<{ key: SecsocOrg; name: string }> {
  return (Object.keys(ORGS) as SecsocOrg[]).map((k) => ({
    key: k,
    name: ORGS[k].name,
  }));
}

// Karim 2026-05-29 : SecsocEmployeeSnapshot + listMissingFields deplaces ici
// (les fichiers "use server" Next.js 16 refusent les exports sync).

export type SecsocEmployeeSnapshot = {
  id: string;
  full_name: string | null;
  birth_date: string | null;
  birth_place: string | null;
  nrn: string | null;
  iban: string | null;
  weekly_hours: number | null;
  work_time_kind: string | null;
  contract_type: string | null;
  start_date: string | null;
  end_date: string | null;
  signature_place: string | null;
  transport_type: string | null;
  transport_frequency: string | null;
  transport_price: string | null;
};

export type RequiredField = {
  key: keyof SecsocEmployeeSnapshot;
  label: string;
};

export const REQUIRED_FIELDS: RequiredField[] = [
  { key: "full_name", label: "Nom complet" },
  { key: "birth_date", label: "Date de naissance" },
  { key: "birth_place", label: "Lieu de naissance" },
  { key: "nrn", label: "Numero national (NRN)" },
  { key: "iban", label: "IBAN" },
  { key: "weekly_hours", label: "Heures hebdo" },
  { key: "work_time_kind", label: "Regime (temps plein/partiel)" },
  { key: "contract_type", label: "Type de contrat (CDD/Etudiant)" },
  { key: "start_date", label: "Date de debut" },
  { key: "end_date", label: "Date de fin" },
  { key: "signature_place", label: "Lieu de signature" },
  { key: "transport_type", label: "Type de transport" },
  { key: "transport_frequency", label: "Période du tarif transport" },
  { key: "transport_price", label: "Prix transport" },
];

export function listMissingFields(emp: SecsocEmployeeSnapshot): RequiredField[] {
  return REQUIRED_FIELDS.filter((f) => {
    const v = emp[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  });
}
