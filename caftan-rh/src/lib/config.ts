export const BRAND = {
  name: "CaftanRH",
  tagline: "Recrutement & gestion RH",
};

export const PIPELINE_STAGES = [
  { id: "new", label: "Nouveau" },
  { id: "contacted", label: "Contacté" },
  { id: "rdv_scheduled", label: "RDV planifié" },
  { id: "rdv_done", label: "RDV fait" },
  { id: "wait_decision", label: "En attente" },
  { id: "hired", label: "Embauché" },
  { id: "refused", label: "Refusé" },
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGES)[number]["id"];

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  rh: "Ressources humaines",
  manager: "Manager",
  candidate: "Candidat",
};

export const COUNTRIES = [
  { code: "BE", name: "Belgique" },
  { code: "FR", name: "France" },
  { code: "LU", name: "Luxembourg" },
  { code: "MA", name: "Maroc" },
  { code: "NL", name: "Pays-Bas" },
];
