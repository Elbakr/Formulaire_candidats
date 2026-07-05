export const BRAND = {
  name: "CaftanRH",
  tagline: "Recrutement & gestion RH",
};

export const PIPELINE_STAGES = [
  { id: "draft", label: "Commencée" },
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

// Modes de transport pour la fiche secrétariat social.
export const TRANSPORT_MODES = [
  "STIB-MIVB",
  "De Lijn",
  "SNCB",
  "TEC",
  "vélo",
  "voiture personnelle",
  "marche",
  "scooter/moto",
  "covoiturage",
] as const;
export type TransportMode = typeof TRANSPORT_MODES[number];

// Karim 2026-07-05 : seuls les transports PUBLICS ont un abonnement (périodicité +
// prix). Pour vélo, marche, voiture, scooter, covoiturage : pas d'abonnement -> on
// ne demande NI périodicité NI prix (sinon champs incohérents pour le candidat).
export const TRANSPORT_WITH_SUBSCRIPTION: readonly string[] = ["STIB-MIVB", "De Lijn", "SNCB", "TEC"];
export function transportHasSubscription(mode: string | null | undefined): boolean {
  return !!mode && TRANSPORT_WITH_SUBSCRIPTION.includes(mode);
}
